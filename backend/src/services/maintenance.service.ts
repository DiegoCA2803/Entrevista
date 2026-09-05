import { MaintenanceRecord, Equipment } from '../domain/types.js';
import { IMaintenanceRepository, IEquipmentRepository, IShiftRepository } from '../repositories/interfaces.js';
import { AuditService } from './audit.service.js';

export class MaintenanceService {
  constructor(
    private maintenanceRepo: IMaintenanceRepository,
    private equipmentRepo: IEquipmentRepository,
    private shiftRepo: IShiftRepository,
    private auditService?: AuditService
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
      throw new Error(`Equipo con ID ${data.equipment_id} no encontrado.`);
    }

    if (!data.performed_by || data.performed_by.trim().length === 0) {
      throw new Error('El nombre del responsable de mantenimiento es obligatorio.');
    }

    if (!data.notes || data.notes.trim().length === 0) {
      throw new Error('Las observaciones del mantenimiento son obligatorias para la trazabilidad.');
    }

    // Horómetro real al momento del servicio
    const horometerAtPm = data.horometer_at_maintenance !== undefined
      ? Number(data.horometer_at_maintenance)
      : equipment.horometer;

    if (horometerAtPm < equipment.last_maintenance_horometer) {
      throw new Error(`El horómetro de mantenimiento (${horometerAtPm}) no puede ser menor al del último mantenimiento (${equipment.last_maintenance_horometer}).`);
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
    const today = new Date().toISOString().split('T')[0];
    const upcomingAssignments = await this.shiftRepo.findUpcomingAssignmentsForEquipment(equipment.id, today);
    let restoredAssignmentsCount = 0;

    for (const assignment of upcomingAssignments) {
      if (assignment.status === 'EN_RIESGO') {
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
