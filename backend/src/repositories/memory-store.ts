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
import {
  IEquipmentRepository,
  IOperatorRepository,
  IShiftRepository,
  IMaintenanceRepository,
  IAuditRepository
} from './interfaces.js';
import crypto from 'node:crypto';

export class MemoryDatabaseState {
  public equipmentMap = new Map<string, Equipment>();
  public operatorMap = new Map<string, Operator>();
  public certificationMap = new Map<string, Certification>();
  public shiftMap = new Map<string, Shift>();
  public assignmentMap = new Map<string, Assignment>();
  public maintenanceList: MaintenanceRecord[] = [];
  public auditLogList: AuditLog[] = [];

  public clear(): void {
    this.equipmentMap.clear();
    this.operatorMap.clear();
    this.certificationMap.clear();
    this.shiftMap.clear();
    this.assignmentMap.clear();
    this.maintenanceList = [];
    this.auditLogList = [];
  }
}

export class MemoryEquipmentRepository implements IEquipmentRepository {
  constructor(private state: MemoryDatabaseState) {}

  async findAll(): Promise<Equipment[]> {
    return Array.from(this.state.equipmentMap.values()).map((e) => ({ ...e }));
  }

  async findById(id: string): Promise<Equipment | null> {
    const eq = this.state.equipmentMap.get(id);
    return eq ? { ...eq } : null;
  }

  async findByCode(code: string): Promise<Equipment | null> {
    if (!code) return null;
    for (const eq of this.state.equipmentMap.values()) {
      if (eq.code && eq.code.toLowerCase() === code.toLowerCase()) {
        return { ...eq };
      }
    }
    return null;
  }

  async create(data: Omit<Equipment, 'created_at' | 'updated_at'>): Promise<Equipment> {
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new Error(`Violación de unicidad: Equipo con código ${data.code} ya existe.`);
    }
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const record: Equipment = {
      ...data,
      id,
      created_at: now,
      updated_at: now
    };
    this.state.equipmentMap.set(id, record);
    return { ...record };
  }

  async updateHorometerAndStatus(
    id: string,
    newHorometer: number,
    status: EquipmentStatus
  ): Promise<Equipment> {
    const eq = this.state.equipmentMap.get(id);
    if (!eq) throw new Error(`Equipo con ID ${id} no encontrado.`);
    eq.horometer = newHorometer;
    eq.status = status;
    eq.updated_at = new Date().toISOString();
    this.state.equipmentMap.set(id, eq);
    return { ...eq };
  }

  async updateStatus(id: string, status: EquipmentStatus): Promise<Equipment> {
    const eq = this.state.equipmentMap.get(id);
    if (!eq) throw new Error(`Equipo con ID ${id} no encontrado.`);
    eq.status = status;
    eq.updated_at = new Date().toISOString();
    this.state.equipmentMap.set(id, eq);
    return { ...eq };
  }

  async resetMaintenanceCycle(
    id: string,
    horometerAtPm: number,
    status: EquipmentStatus
  ): Promise<Equipment> {
    const eq = this.state.equipmentMap.get(id);
    if (!eq) throw new Error(`Equipo con ID ${id} no encontrado.`);
    eq.last_maintenance_horometer = horometerAtPm;
    eq.horometer = horometerAtPm;
    eq.status = status;
    eq.updated_at = new Date().toISOString();
    this.state.equipmentMap.set(id, eq);
    return { ...eq };
  }
}

export class MemoryOperatorRepository implements IOperatorRepository {
  constructor(private state: MemoryDatabaseState) {}

  async findAll(): Promise<Operator[]> {
    const ops: Operator[] = [];
    for (const op of this.state.operatorMap.values()) {
      const certs = await this.getCertificationsByOperatorId(op.id);
      ops.push({ ...op, certifications: certs });
    }
    return ops;
  }

  async findById(id: string): Promise<Operator | null> {
    const op = this.state.operatorMap.get(id);
    if (!op) return null;
    const certs = await this.getCertificationsByOperatorId(id);
    return { ...op, certifications: certs };
  }

  async findByCode(code: string): Promise<Operator | null> {
    if (!code) return null;
    for (const op of this.state.operatorMap.values()) {
      if (op.code && op.code.toLowerCase() === code.toLowerCase()) {
        const certs = await this.getCertificationsByOperatorId(op.id);
        return { ...op, certifications: certs };
      }
    }
    return null;
  }

  async create(data: Omit<Operator, 'created_at' | 'certifications'>): Promise<Operator> {
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new Error(`Violación de unicidad: Operador con código ${data.code} ya existe.`);
    }
    const id = data.id || crypto.randomUUID();
    const record: Operator = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      certifications: []
    };
    this.state.operatorMap.set(id, record);
    return { ...record };
  }

  async addCertification(cert: Omit<Certification, 'id'>): Promise<Certification> {
    const op = this.state.operatorMap.get(cert.operator_id);
    if (!op) throw new Error(`Operador con ID ${cert.operator_id} no existe.`);
    const id = crypto.randomUUID();
    const record: Certification = { ...cert, id };
    this.state.certificationMap.set(id, record);
    return { ...record };
  }

  async getCertificationsByOperatorId(operatorId: string): Promise<Certification[]> {
    const results: Certification[] = [];
    for (const c of this.state.certificationMap.values()) {
      if (c.operator_id === operatorId) {
        results.push({ ...c });
      }
    }
    return results;
  }
}

export class MemoryShiftRepository implements IShiftRepository {
  constructor(private state: MemoryDatabaseState) {}

  async findAll(): Promise<Shift[]> {
    const shifts: Shift[] = [];
    for (const s of this.state.shiftMap.values()) {
      const assignments = await this.findAssignmentsByShiftId(s.id);
      shifts.push({ ...s, assignments });
    }
    return shifts.sort((a, b) => a.date.localeCompare(b.date));
  }

  async findById(id: string): Promise<Shift | null> {
    const s = this.state.shiftMap.get(id);
    if (!s) return null;
    const assignments = await this.findAssignmentsByShiftId(id);
    return { ...s, assignments };
  }

  async findByCode(code: string): Promise<Shift | null> {
    if (!code) return null;
    for (const s of this.state.shiftMap.values()) {
      if (s.code && s.code.toLowerCase() === code.toLowerCase()) {
        const assignments = await this.findAssignmentsByShiftId(s.id);
        return { ...s, assignments };
      }
    }
    return null;
  }

  async findByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    const results: Shift[] = [];
    for (const s of this.state.shiftMap.values()) {
      if (s.date >= startDate && s.date <= endDate) {
        const assignments = await this.findAssignmentsByShiftId(s.id);
        results.push({ ...s, assignments });
      }
    }
    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async create(data: Omit<Shift, 'id' | 'created_at' | 'assignments'>): Promise<Shift> {
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new Error(`Violación de unicidad: Turno con código ${data.code} ya existe.`);
    }
    const id = crypto.randomUUID();
    const record: Shift = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      assignments: []
    };
    this.state.shiftMap.set(id, record);
    return { ...record };
  }

  async updateStatus(
    id: string,
    status: ShiftStatus,
    actualHours?: number,
    closedBy?: string,
    notes?: string
  ): Promise<Shift> {
    const s = this.state.shiftMap.get(id);
    if (!s) throw new Error(`Turno con ID ${id} no encontrado.`);
    s.status = status;
    if (actualHours !== undefined) s.actual_duration_hours = actualHours;
    if (closedBy !== undefined) s.closed_by = closedBy;
    if (notes !== undefined) s.notes = notes;
    if (status === 'CERRADO') s.closed_at = new Date().toISOString();
    this.state.shiftMap.set(id, s);
    const assignments = await this.findAssignmentsByShiftId(id);
    return { ...s, assignments };
  }

  async findAssignmentsByShiftId(shiftId: string): Promise<Assignment[]> {
    const results: Assignment[] = [];
    for (const a of this.state.assignmentMap.values()) {
      if (a.shift_id === shiftId) {
        const eq = this.state.equipmentMap.get(a.equipment_id);
        const op = this.state.operatorMap.get(a.operator_id);
        results.push({
          ...a,
          equipment: eq ? { ...eq } : undefined,
          operator: op ? { ...op } : undefined
        });
      }
    }
    return results;
  }

  async findAssignmentById(id: string): Promise<Assignment | null> {
    const a = this.state.assignmentMap.get(id);
    if (!a) return null;
    const eq = this.state.equipmentMap.get(a.equipment_id);
    const op = this.state.operatorMap.get(a.operator_id);
    const shift = this.state.shiftMap.get(a.shift_id);
    return {
      ...a,
      equipment: eq ? { ...eq } : undefined,
      operator: op ? { ...op } : undefined,
      shift: shift ? { ...shift } : undefined
    };
  }

  async findAssignmentByShiftAndEquipment(shiftId: string, equipmentId: string): Promise<Assignment | null> {
    for (const a of this.state.assignmentMap.values()) {
      if (a.shift_id === shiftId && a.equipment_id === equipmentId && a.status !== 'CANCELADA') {
        return { ...a };
      }
    }
    return null;
  }

  async findAssignmentByShiftAndOperator(shiftId: string, operatorId: string): Promise<Assignment | null> {
    for (const a of this.state.assignmentMap.values()) {
      if (a.shift_id === shiftId && a.operator_id === operatorId && a.status !== 'CANCELADA') {
        return { ...a };
      }
    }
    return null;
  }

  async findUpcomingAssignmentsForEquipment(equipmentId: string, fromDate: string): Promise<Assignment[]> {
    const results: Assignment[] = [];
    for (const a of this.state.assignmentMap.values()) {
      if (a.equipment_id === equipmentId && a.status !== 'CANCELADA' && a.status !== 'COMPLETADA') {
        const shift = this.state.shiftMap.get(a.shift_id);
        if (shift && shift.date >= fromDate && shift.status !== 'CANCELADO' && shift.status !== 'CERRADO') {
          results.push({ ...a, shift: { ...shift } });
        }
      }
    }
    return results.sort((a, b) => (a.shift?.date || '').localeCompare(b.shift?.date || ''));
  }

  async createAssignment(data: Omit<Assignment, 'id' | 'created_at'>): Promise<Assignment> {
    if (!this.state.shiftMap.has(data.shift_id)) {
      throw new Error(`Integridad referencial: Turno ${data.shift_id} no existe.`);
    }
    if (!this.state.equipmentMap.has(data.equipment_id)) {
      throw new Error(`Integridad referencial: Equipo ${data.equipment_id} no existe.`);
    }
    if (!this.state.operatorMap.has(data.operator_id)) {
      throw new Error(`Integridad referencial: Operador ${data.operator_id} no existe.`);
    }

    const existingEq = await this.findAssignmentByShiftAndEquipment(data.shift_id, data.equipment_id);
    if (existingEq) {
      throw new Error(
        `Violación de unicidad (uq_shift_equipment): El equipo ya está asignado en este turno.`
      );
    }

    const existingOp = await this.findAssignmentByShiftAndOperator(data.shift_id, data.operator_id);
    if (existingOp) {
      throw new Error(
        `Violación de unicidad (uq_shift_operator): El operador ya tiene una asignación en este turno.`
      );
    }

    const id = crypto.randomUUID();
    const record: Assignment = {
      ...data,
      id,
      created_at: new Date().toISOString()
    };
    this.state.assignmentMap.set(id, record);

    const eq = this.state.equipmentMap.get(record.equipment_id);
    const op = this.state.operatorMap.get(record.operator_id);
    return {
      ...record,
      equipment: eq ? { ...eq } : undefined,
      operator: op ? { ...op } : undefined
    };
  }

  async updateAssignmentStatus(
    id: string,
    status: Assignment['status'],
    riskReason?: string | null
  ): Promise<Assignment> {
    const a = this.state.assignmentMap.get(id);
    if (!a) throw new Error(`Asignación con ID ${id} no encontrada.`);
    a.status = status;
    if (riskReason !== undefined) a.risk_reason = riskReason;
    this.state.assignmentMap.set(id, a);
    return { ...a };
  }
}

export class MemoryMaintenanceRepository implements IMaintenanceRepository {
  constructor(private state: MemoryDatabaseState) {}

  async findAll(): Promise<MaintenanceRecord[]> {
    return [...this.state.maintenanceList].sort((a, b) => b.date.localeCompare(a.date));
  }

  async findByEquipmentId(equipmentId: string): Promise<MaintenanceRecord[]> {
    return this.state.maintenanceList
      .filter((m) => m.equipment_id === equipmentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async create(data: Omit<MaintenanceRecord, 'id' | 'created_at'>): Promise<MaintenanceRecord> {
    if (!this.state.equipmentMap.has(data.equipment_id)) {
      throw new Error(`Integridad referencial: Equipo ${data.equipment_id} no existe.`);
    }
    const id = crypto.randomUUID();
    const record: MaintenanceRecord = {
      ...data,
      id,
      created_at: new Date().toISOString()
    };
    this.state.maintenanceList.push(record);
    return { ...record };
  }
}

export class MemoryAuditRepository implements IAuditRepository {
  constructor(private state: MemoryDatabaseState) {}

  async log(audit: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const id = crypto.randomUUID();
    const record: AuditLog = {
      ...audit,
      id,
      created_at: new Date().toISOString()
    };
    this.state.auditLogList.unshift(record);
    return { ...record };
  }

  async findAll(limit: number = 100): Promise<AuditLog[]> {
    return this.state.auditLogList.slice(0, limit);
  }
}
