import { ProjectionItem, Shift, Equipment } from '../domain/types.js';
import { IEquipmentRepository, IShiftRepository } from '../repositories/interfaces.js';
import { ResilientExecutor } from '../resilience/resilient-executor.js';
import { localDate } from '../domain/time.js';
import { ValidationError } from '../core/errors/app-error.js';

export class ProjectionService {
  constructor(
    private equipmentRepo: IEquipmentRepository,
    private shiftRepo: IShiftRepository
  ) {}

  /**
   * REGLA 12 (OBLIGATORIA):
   * Proyecta qué equipos van a llegar a su mantenimiento en los próximos 7 días
   * según los turnos ya programados.
   *
   * Utiliza ResilientExecutor para Degradación Elegante: si el servicio
   * de proyección analítica experimenta fallas o timeout, devuelve una estimación
   * segura sin comprometer la operativa del sistema minero.
   */
  async get7DayMaintenanceProjection(referenceDate?: string): Promise<{
    projection: ProjectionItem[];
    startDate: string;
    endDate: string;
    isDegraded: boolean;
    warning?: string;
  }> {
    const today = referenceDate || localDate();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
      !Number.isFinite(Date.parse(today)) ||
      new Date(today).toISOString().slice(0, 10) !== today
    )
      throw new ValidationError('Fecha de proyección inválida.');

    // Calcular fecha + 7 días
    const startDateObj = new Date(today);
    const endDateObj = new Date(startDateObj);
    endDateObj.setUTCDate(endDateObj.getUTCDate() + 6);
    const endDate = endDateObj.toISOString().split('T')[0];

    const result = await ResilientExecutor.executeWithFallback(
      'ProjectionService',
      async () => {
        return this.calculateProjection(today, endDate);
      },
      async (err) => {
        console.warn(`[ProjectionService] Activando degradación elegante para proyección: ${err.message}`);
        return this.calculateDegradedFallback(today, endDate);
      }
    );

    return {
      projection: result.result,
      startDate: today,
      endDate,
      isDegraded: result.isDegraded,
      warning: result.warning
    };
  }

  private async calculateProjection(startDate: string, endDate: string): Promise<ProjectionItem[]> {
    const allEquipment = await this.equipmentRepo.findAll();
    const upcomingShifts = await this.shiftRepo.findByDateRange(startDate, endDate);

    // Filtrar solo turnos programados o en curso
    const activeShifts = upcomingShifts.filter((s) => s.status === 'PROGRAMADO' || s.status === 'EN_CURSO');

    // Ordenar turnos cronológicamente por fecha y jornada (DIA antes que NOCHE)
    activeShifts.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.period === 'DIA' ? -1 : 1;
    });

    const projectionItems: ProjectionItem[] = [];

    for (const eq of allEquipment) {
      const nextThreshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
      const hoursRemaining = Math.max(0, nextThreshold - eq.horometer);

      // Buscar asignaciones de este equipo en los turnos de la ventana de 7 días
      let scheduledHours = 0;
      let scheduledCount = 0;
      let runningHorometer = eq.horometer;
      let willReach = false;
      let criticalDate: string | null = null;
      let criticalPeriod: Shift['period'] | null = null;

      for (const shift of activeShifts) {
        const assignment = shift.assignments?.find(
          (a) => a.equipment_id === eq.id && a.status !== 'CANCELADA'
        );
        if (assignment) {
          scheduledCount++;
          const shiftHours = shift.planned_duration_hours;
          scheduledHours += shiftHours;
          runningHorometer += shiftHours;

          // Detectar el momento exacto en que cruza el umbral
          if (!willReach && runningHorometer >= nextThreshold) {
            willReach = true;
            criticalDate = shift.date;
            criticalPeriod = shift.period;
          }
        }
      }

      // Si el equipo ya está bloqueado o alcanzó el umbral en su estado actual
      if (eq.status === 'BLOQUEADO' || eq.horometer >= nextThreshold) {
        willReach = true;
      }

      projectionItems.push({
        equipment_id: eq.id,
        equipment_code: eq.code,
        equipment_name: eq.name,
        equipment_type: eq.type,
        current_horometer: eq.horometer,
        last_maintenance_horometer: eq.last_maintenance_horometer,
        maintenance_interval_hours: eq.maintenance_interval_hours,
        next_maintenance_threshold: nextThreshold,
        hours_remaining_until_pm: Number(hoursRemaining.toFixed(2)),
        projected_scheduled_hours_7days: Number(scheduledHours.toFixed(2)),
        projected_total_horometer: Number(runningHorometer.toFixed(2)),
        will_reach_maintenance: willReach,
        critical_shift_date: criticalDate,
        critical_shift_period: criticalPeriod,
        scheduled_shifts_count: scheduledCount,
        status: eq.status
      });
    }

    // Ordenar: primero los que alcanzarán mantenimiento, luego por menor cantidad de horas restantes
    return projectionItems.sort((a, b) => {
      if (a.will_reach_maintenance && !b.will_reach_maintenance) return -1;
      if (!a.will_reach_maintenance && b.will_reach_maintenance) return 1;
      return a.hours_remaining_until_pm - b.hours_remaining_until_pm;
    });
  }

  /**
   * Fallback de degradación elegante: cálculo lineal sin depender del join detallado de turnos
   */
  private async calculateDegradedFallback(startDate: string, endDate: string): Promise<ProjectionItem[]> {
    const allEquipment = await this.equipmentRepo.findAll();
    return allEquipment.map((eq) => {
      const nextThreshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
      const hoursRemaining = Math.max(0, nextThreshold - eq.horometer);
      return {
        equipment_id: eq.id,
        equipment_code: eq.code,
        equipment_name: eq.name,
        equipment_type: eq.type,
        current_horometer: eq.horometer,
        last_maintenance_horometer: eq.last_maintenance_horometer,
        maintenance_interval_hours: eq.maintenance_interval_hours,
        next_maintenance_threshold: nextThreshold,
        hours_remaining_until_pm: Number(hoursRemaining.toFixed(2)),
        projected_scheduled_hours_7days: 0,
        projected_total_horometer: eq.horometer,
        will_reach_maintenance: eq.status === 'BLOQUEADO' || eq.horometer >= nextThreshold,
        critical_shift_date: null,
        critical_shift_period: null,
        scheduled_shifts_count: 0,
        status: eq.status
      };
    });
  }
}
