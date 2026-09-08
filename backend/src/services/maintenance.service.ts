import { MaintenanceRecord, Equipment } from '../domain/types.js';
import {
  IMaintenanceRepository,
  IEquipmentRepository,
  IShiftRepository
} from '../repositories/interfaces.js';
import { AuditService } from './audit.service.js';
import { NotFoundError, ValidationError } from '../core/errors/app-error.js';
import { OperatorService } from './operator.service.js';
import { localDate, shiftLastDate } from '../domain/time.js';

export class MaintenanceService {
  constructor(
    private readonly maintenanceRepo: IMaintenanceRepository,
    private readonly equipmentRepo: IEquipmentRepository,
    private readonly shiftRepo: IShiftRepository,
    private readonly auditService?: AuditService,
    private readonly operatorService?: OperatorService
  ) {}

  async getAllMaintenanceRecords(): Promise<MaintenanceRecord[]> {
    return this.maintenanceRepo.findAll();
  }

  async getRecordsByEquipment(equipmentId: string): Promise<MaintenanceRecord[]> {
    return this.maintenanceRepo.findByEquipmentId(equipmentId);
  }

  /**
   * Regla 3: Registrar un mantenimiento libera el equipo y deja historial.
   * Decisión 3: El siguiente ciclo se cuenta desde el horómetro REAL al momento del mantenimiento.
   */
  async registerMaintenance(data: {
    equipment_id: string;
    performed_by: string;
    notes: string;
    maintenance_type?: 'PREVENTIVO' | 'CORRECTIVO';
    horometer_at_maintenance?: number;
  }): Promise<{ equipment: Equipment; record: MaintenanceRecord; restoredAssignmentsCount: number }> {
    const equipment = await this.equipmentRepo.findById(data.equipment_id);
    if (!equipment) {
      throw new NotFoundError('Equipo minero', data.equipment_id);
    }

    if (!data.performed_by || data.performed_by.trim().length === 0) {
      throw new ValidationError('El nombre del responsable de mantenimiento es obligatorio.');
    }

    if (!data.notes || data.notes.trim().length === 0) {
      throw new ValidationError('Las observaciones del mantenimiento son obligatorias para la trazabilidad.');
    }

    // Horómetro real al momento del servicio
    const horometerAtPm =
      data.horometer_at_maintenance !== undefined
        ? Number(data.horometer_at_maintenance)
        : equipment.horometer;

    if (!Number.isFinite(horometerAtPm) || horometerAtPm < equipment.horometer) {
      throw new ValidationError(
        `El horómetro de mantenimiento debe ser válido y no puede ser menor al actual (${equipment.horometer}h).`
      );
    }

    // 1. Registrar en el historial de mantenimiento
    const record = await this.maintenanceRepo.create({
      equipment_id: equipment.id,
      date: new Date().toISOString(),
      horometer_at_maintenance: horometerAtPm,
      performed_by: data.performed_by.trim(),
      notes: data.notes.trim(),
      maintenance_type: data.maintenance_type || 'PREVENTIVO'
    });

    // 2. Liberar el equipo y restablecer ciclo desde el horómetro real
    const updatedEquipment = await this.equipmentRepo.resetMaintenanceCycle(
      equipment.id,
      horometerAtPm,
      'DISPONIBLE'
    );

    // 3. Resolución de conflicto en turnos futuros: si había asignaciones "EN_RIESGO" para este equipo, restaurarlas
    const today = localDate();
    const upcomingAssignments = await this.shiftRepo.findUpcomingAssignmentsForEquipment(equipment.id, today);
    let restoredAssignmentsCount = 0;

    for (const assignment of upcomingAssignments) {
      if (assignment.status === 'EN_RIESGO') {
        const shift = assignment.shift;
        if (shift && this.operatorService) {
          const cert = await this.operatorService.validateCertificationForShift(
            assignment.operator_id,
            equipment.type,
            shift.date,
            shiftLastDate(shift.date, shift.period, shift.planned_duration_hours)
          );
          if (!cert.isValid) {
            await this.shiftRepo.updateAssignmentStatus(assignment.id, 'EN_RIESGO', cert.reason);
            continue;
          }
        }
        await this.shiftRepo.updateAssignmentStatus(assignment.id, 'PROGRAMADA', null);
        restoredAssignmentsCount++;
      }
    }

    // 4. Auditoría
    if (this.auditService) {
      await this.auditService.log({
        action: 'MAINTENANCE_REGISTERED',
        entity_type: 'EQUIPMENT',
        entity_id: equipment.id,
        details: {
          equipment_code: equipment.code,
          horometer_at_pm: horometerAtPm,
          previous_last_pm: equipment.last_maintenance_horometer,
          interval: equipment.maintenance_interval_hours,
          next_threshold: horometerAtPm + equipment.maintenance_interval_hours,
          performed_by: data.performed_by,
          restored_assignments: restoredAssignmentsCount
        },
        performed_by: data.performed_by
      });
    }

    return { equipment: updatedEquipment, record, restoredAssignmentsCount };
  }
}
