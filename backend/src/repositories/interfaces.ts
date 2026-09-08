import {
  Equipment,
  Operator,
  Certification,
  Shift,
  Assignment,
  MaintenanceRecord,
  AuditLog,
  EquipmentStatus,
  ShiftStatus
} from '../domain/types.js';

export interface IEquipmentRepository {
  findAll(): Promise<Equipment[]>;
  findById(id: string): Promise<Equipment | null>;
  findByCode(code: string): Promise<Equipment | null>;
  create(
    equipment: Omit<Equipment, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<Equipment>;
  updateHorometerAndStatus(id: string, newHorometer: number, status: EquipmentStatus): Promise<Equipment>;
  updateStatus(id: string, status: EquipmentStatus): Promise<Equipment>;
  resetMaintenanceCycle(id: string, horometerAtPm: number, status: EquipmentStatus): Promise<Equipment>;
}

export interface IOperatorRepository {
  findAll(): Promise<Operator[]>;
  findById(id: string): Promise<Operator | null>;
  findByCode(code: string): Promise<Operator | null>;
  create(
    operator: Omit<Operator, 'id' | 'created_at' | 'certifications'> & { id?: string }
  ): Promise<Operator>;
  addCertification(cert: Omit<Certification, 'id'>): Promise<Certification>;
  getCertificationsByOperatorId(operatorId: string): Promise<Certification[]>;
}

export interface IShiftRepository {
  findAll(): Promise<Shift[]>;
  findById(id: string): Promise<Shift | null>;
  findByCode(code: string): Promise<Shift | null>;
  findByDateRange(startDate: string, endDate: string): Promise<Shift[]>;
  create(shift: Omit<Shift, 'id' | 'created_at' | 'assignments'>): Promise<Shift>;
  updateStatus(
    id: string,
    status: ShiftStatus,
    actualHours?: number,
    closedBy?: string,
    notes?: string
  ): Promise<Shift>;

  // Assignments
  findAssignmentsByShiftId(shiftId: string): Promise<Assignment[]>;
  findAssignmentById(id: string): Promise<Assignment | null>;
  findAssignmentByShiftAndEquipment(shiftId: string, equipmentId: string): Promise<Assignment | null>;
  findAssignmentByShiftAndOperator(shiftId: string, operatorId: string): Promise<Assignment | null>;
  findUpcomingAssignmentsForEquipment(equipmentId: string, fromDate: string): Promise<Assignment[]>;
  createAssignment(assignment: Omit<Assignment, 'id' | 'created_at'>): Promise<Assignment>;
  updateAssignmentStatus(
    id: string,
    status: Assignment['status'],
    riskReason?: string | null
  ): Promise<Assignment>;
}

export interface IMaintenanceRepository {
  findAll(): Promise<MaintenanceRecord[]>;
  findByEquipmentId(equipmentId: string): Promise<MaintenanceRecord[]>;
  create(record: Omit<MaintenanceRecord, 'id' | 'created_at'>): Promise<MaintenanceRecord>;
}

export interface IAuditRepository {
  log(audit: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog>;
  findAll(limit?: number): Promise<AuditLog[]>;
}
