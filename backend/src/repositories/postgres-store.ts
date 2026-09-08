import pkg from 'pg';
const { Pool } = pkg;
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

export class PostgresEquipmentRepository implements IEquipmentRepository {
  constructor(private pool: pkg.Pool) {}

  async findAll(): Promise<Equipment[]> {
    const res = await this.pool.query(`
      SELECT id, code, name, type, horometer::float, maintenance_interval_hours::float, 
             last_maintenance_horometer::float, status, created_at, updated_at
      FROM equipment ORDER BY code ASC
    `);
    return res.rows;
  }

  async findById(id: string): Promise<Equipment | null> {
    const res = await this.pool.query(
      `SELECT id, code, name, type, horometer::float, maintenance_interval_hours::float, 
              last_maintenance_horometer::float, status, created_at, updated_at
       FROM equipment WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findByCode(code: string): Promise<Equipment | null> {
    if (!code) return null;
    const res = await this.pool.query(
      `SELECT id, code, name, type, horometer::float, maintenance_interval_hours::float, 
              last_maintenance_horometer::float, status, created_at, updated_at
       FROM equipment WHERE LOWER(code) = LOWER($1)`,
      [code]
    );
    return res.rows[0] || null;
  }

  async create(
    data: Omit<Equipment, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<Equipment> {
    const id = data.id || crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO equipment (id, code, name, type, horometer, maintenance_interval_hours, last_maintenance_horometer, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, code, name, type, horometer::float, maintenance_interval_hours::float, 
                 last_maintenance_horometer::float, status, created_at, updated_at`,
      [
        id,
        data.code,
        data.name,
        data.type,
        data.horometer,
        data.maintenance_interval_hours,
        data.last_maintenance_horometer,
        data.status
      ]
    );
    return res.rows[0];
  }

  async updateHorometerAndStatus(
    id: string,
    newHorometer: number,
    status: EquipmentStatus
  ): Promise<Equipment> {
    const res = await this.pool.query(
      `UPDATE equipment 
       SET horometer = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, code, name, type, horometer::float, maintenance_interval_hours::float, 
                 last_maintenance_horometer::float, status, created_at, updated_at`,
      [newHorometer, status, id]
    );
    if (res.rows.length === 0) throw new Error(`Equipo con ID ${id} no encontrado.`);
    return res.rows[0];
  }

  async updateStatus(id: string, status: EquipmentStatus): Promise<Equipment> {
    const res = await this.pool.query(
      `UPDATE equipment 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, code, name, type, horometer::float, maintenance_interval_hours::float, 
                 last_maintenance_horometer::float, status, created_at, updated_at`,
      [status, id]
    );
    if (res.rows.length === 0) throw new Error(`Equipo con ID ${id} no encontrado.`);
    return res.rows[0];
  }

  async resetMaintenanceCycle(
    id: string,
    horometerAtPm: number,
    status: EquipmentStatus
  ): Promise<Equipment> {
    const res = await this.pool.query(
      `UPDATE equipment 
       SET last_maintenance_horometer = $1, horometer = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, code, name, type, horometer::float, maintenance_interval_hours::float, 
                 last_maintenance_horometer::float, status, created_at, updated_at`,
      [horometerAtPm, status, id]
    );
    if (res.rows.length === 0) throw new Error(`Equipo con ID ${id} no encontrado.`);
    return res.rows[0];
  }
}

export class PostgresOperatorRepository implements IOperatorRepository {
  constructor(private pool: pkg.Pool) {}

  async findAll(): Promise<Operator[]> {
    const res = await this.pool.query(`
      SELECT id, code, name, document_id, is_active, created_at
      FROM operators ORDER BY name ASC
    `);
    const ops: Operator[] = [];
    for (const row of res.rows) {
      const certs = await this.getCertificationsByOperatorId(row.id);
      ops.push({ ...row, certifications: certs });
    }
    return ops;
  }

  async findById(id: string): Promise<Operator | null> {
    const res = await this.pool.query(
      `SELECT id, code, name, document_id, is_active, created_at FROM operators WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const certs = await this.getCertificationsByOperatorId(id);
    return { ...res.rows[0], certifications: certs };
  }

  async findByCode(code: string): Promise<Operator | null> {
    if (!code) return null;
    const res = await this.pool.query(
      `SELECT id, code, name, document_id, is_active, created_at FROM operators WHERE LOWER(code) = LOWER($1)`,
      [code]
    );
    if (res.rows.length === 0) return null;
    const certs = await this.getCertificationsByOperatorId(res.rows[0].id);
    return { ...res.rows[0], certifications: certs };
  }

  async create(
    data: Omit<Operator, 'id' | 'created_at' | 'certifications'> & { id?: string }
  ): Promise<Operator> {
    const id = data.id || crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO operators (id, code, name, document_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, document_id, is_active, created_at`,
      [id, data.code, data.name, data.document_id, data.is_active]
    );
    return { ...res.rows[0], certifications: [] };
  }

  async addCertification(cert: Omit<Certification, 'id'>): Promise<Certification> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO certifications (id, operator_id, equipment_type, issued_date, expiration_date, institution)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, operator_id, equipment_type, TO_CHAR(issued_date, 'YYYY-MM-DD') as issued_date, 
                 TO_CHAR(expiration_date, 'YYYY-MM-DD') as expiration_date, institution, created_at`,
      [
        id,
        cert.operator_id,
        cert.equipment_type,
        cert.issued_date,
        cert.expiration_date,
        cert.institution || null
      ]
    );
    return res.rows[0];
  }

  async getCertificationsByOperatorId(operatorId: string): Promise<Certification[]> {
    const res = await this.pool.query(
      `SELECT id, operator_id, equipment_type, TO_CHAR(issued_date, 'YYYY-MM-DD') as issued_date, 
              TO_CHAR(expiration_date, 'YYYY-MM-DD') as expiration_date, institution, created_at
       FROM certifications WHERE operator_id = $1 ORDER BY expiration_date DESC`,
      [operatorId]
    );
    return res.rows;
  }
}

export class PostgresShiftRepository implements IShiftRepository {
  constructor(private pool: pkg.Pool) {}

  async findAll(): Promise<Shift[]> {
    const res = await this.pool.query(`
      SELECT id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
             actual_duration_hours::float, status, closed_at, closed_by, notes, created_at
      FROM shifts ORDER BY date ASC, period ASC
    `);
    const shifts: Shift[] = [];
    for (const row of res.rows) {
      const assignments = await this.findAssignmentsByShiftId(row.id);
      shifts.push({ ...row, assignments });
    }
    return shifts;
  }

  async findById(id: string): Promise<Shift | null> {
    const res = await this.pool.query(
      `SELECT id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
              actual_duration_hours::float, status, closed_at, closed_by, notes, created_at
       FROM shifts WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const assignments = await this.findAssignmentsByShiftId(id);
    return { ...res.rows[0], assignments };
  }

  async findByCode(code: string): Promise<Shift | null> {
    if (!code) return null;
    const res = await this.pool.query(
      `SELECT id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
              actual_duration_hours::float, status, closed_at, closed_by, notes, created_at
       FROM shifts WHERE LOWER(code) = LOWER($1)`,
      [code]
    );
    if (res.rows.length === 0) return null;
    const assignments = await this.findAssignmentsByShiftId(res.rows[0].id);
    return { ...res.rows[0], assignments };
  }

  async findByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    const res = await this.pool.query(
      `SELECT id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
              actual_duration_hours::float, status, closed_at, closed_by, notes, created_at
       FROM shifts WHERE date >= $1 AND date <= $2 ORDER BY date ASC, period ASC`,
      [startDate, endDate]
    );
    const shifts: Shift[] = [];
    for (const row of res.rows) {
      const assignments = await this.findAssignmentsByShiftId(row.id);
      shifts.push({ ...row, assignments });
    }
    return shifts;
  }

  async create(data: Omit<Shift, 'id' | 'created_at' | 'assignments'>): Promise<Shift> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO shifts (id, code, date, period, planned_duration_hours, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
                 actual_duration_hours::float, status, closed_at, closed_by, notes, created_at`,
      [id, data.code, data.date, data.period, data.planned_duration_hours, data.status, data.notes || null]
    );
    return { ...res.rows[0], assignments: [] };
  }

  async updateStatus(
    id: string,
    status: ShiftStatus,
    actualHours?: number,
    closedBy?: string,
    notes?: string
  ): Promise<Shift> {
    const res = await this.pool.query(
      `UPDATE shifts
       SET status = $1::varchar,
           actual_duration_hours = COALESCE($2, actual_duration_hours),
           closed_by = COALESCE($3, closed_by),
           notes = COALESCE($4, notes),
           closed_at = CASE WHEN $1 = 'CERRADO' THEN CURRENT_TIMESTAMP ELSE closed_at END
       WHERE id = $5
       RETURNING id, code, TO_CHAR(date, 'YYYY-MM-DD') as date, period, planned_duration_hours::float,
                 actual_duration_hours::float, status, closed_at, closed_by, notes, created_at`,
      [status, actualHours ?? null, closedBy ?? null, notes ?? null, id]
    );
    if (res.rows.length === 0) throw new Error(`Turno con ID ${id} no encontrado.`);
    const assignments = await this.findAssignmentsByShiftId(id);
    return { ...res.rows[0], assignments };
  }

  async findAssignmentsByShiftId(shiftId: string): Promise<Assignment[]> {
    const res = await this.pool.query(
      `SELECT a.id, a.shift_id, a.equipment_id, a.operator_id, a.status, a.risk_reason,
              a.is_override, a.override_by, a.override_reason, a.override_at, a.created_at,
              e.code as eq_code, e.name as eq_name, e.type as eq_type, e.horometer::float as eq_horometer,
              e.maintenance_interval_hours::float as eq_interval, e.last_maintenance_horometer::float as eq_last_pm,
              e.status as eq_status,
              o.code as op_code, o.name as op_name, o.document_id as op_doc, o.is_active as op_active
       FROM assignments a
       JOIN equipment e ON a.equipment_id = e.id
       JOIN operators o ON a.operator_id = o.id
       WHERE a.shift_id = $1`,
      [shiftId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      shift_id: row.shift_id,
      equipment_id: row.equipment_id,
      operator_id: row.operator_id,
      status: row.status,
      risk_reason: row.risk_reason,
      is_override: row.is_override,
      override_by: row.override_by,
      override_reason: row.override_reason,
      override_at: row.override_at,
      created_at: row.created_at,
      equipment: {
        id: row.equipment_id,
        code: row.eq_code,
        name: row.eq_name,
        type: row.eq_type,
        horometer: row.eq_horometer,
        maintenance_interval_hours: row.eq_interval,
        last_maintenance_horometer: row.eq_last_pm,
        status: row.eq_status
      },
      operator: {
        id: row.operator_id,
        code: row.op_code,
        name: row.op_name,
        document_id: row.op_doc,
        is_active: row.op_active
      }
    }));
  }

  async findAssignmentById(id: string): Promise<Assignment | null> {
    const res = await this.pool.query(
      `SELECT a.id, a.shift_id, a.equipment_id, a.operator_id, a.status, a.risk_reason,
              a.is_override, a.override_by, a.override_reason, a.override_at, a.created_at,
              e.code as eq_code, e.name as eq_name, e.type as eq_type, e.horometer::float as eq_horometer,
              e.status as eq_status,
              o.code as op_code, o.name as op_name
       FROM assignments a
       JOIN equipment e ON a.equipment_id = e.id
       JOIN operators o ON a.operator_id = o.id
       WHERE a.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      shift_id: row.shift_id,
      equipment_id: row.equipment_id,
      operator_id: row.operator_id,
      status: row.status,
      risk_reason: row.risk_reason,
      is_override: row.is_override,
      override_by: row.override_by,
      override_reason: row.override_reason,
      override_at: row.override_at,
      created_at: row.created_at,
      equipment: {
        id: row.equipment_id,
        code: row.eq_code,
        name: row.eq_name,
        type: row.eq_type,
        horometer: row.eq_horometer,
        maintenance_interval_hours: 250,
        last_maintenance_horometer: 0,
        status: row.eq_status
      },
      operator: {
        id: row.operator_id,
        code: row.op_code,
        name: row.op_name,
        document_id: '',
        is_active: true
      }
    };
  }

  async findAssignmentByShiftAndEquipment(shiftId: string, equipmentId: string): Promise<Assignment | null> {
    const res = await this.pool.query(
      `SELECT id, shift_id, equipment_id, operator_id, status, is_override FROM assignments 
       WHERE shift_id = $1 AND equipment_id = $2 AND status<>'CANCELADA'`,
      [shiftId, equipmentId]
    );
    return res.rows[0] || null;
  }

  async findAssignmentByShiftAndOperator(shiftId: string, operatorId: string): Promise<Assignment | null> {
    const res = await this.pool.query(
      `SELECT id, shift_id, equipment_id, operator_id, status, is_override FROM assignments 
       WHERE shift_id = $1 AND operator_id = $2 AND status<>'CANCELADA'`,
      [shiftId, operatorId]
    );
    return res.rows[0] || null;
  }

  async findUpcomingAssignmentsForEquipment(equipmentId: string, fromDate: string): Promise<Assignment[]> {
    const res = await this.pool.query(
      `SELECT a.id, a.shift_id, a.equipment_id, a.operator_id, a.status, a.risk_reason,
              TO_CHAR(s.date, 'YYYY-MM-DD') as date, s.period, s.planned_duration_hours::float, s.status as shift_status
       FROM assignments a
       JOIN shifts s ON a.shift_id = s.id
       WHERE a.equipment_id = $1 AND s.date >= $2 AND a.status NOT IN ('CANCELADA','COMPLETADA') AND s.status NOT IN ('CANCELADO', 'CERRADO')
       ORDER BY s.date ASC, s.period ASC`,
      [equipmentId, fromDate]
    );
    return res.rows.map((row) => ({
      id: row.id,
      shift_id: row.shift_id,
      equipment_id: row.equipment_id,
      operator_id: row.operator_id,
      status: row.status,
      risk_reason: row.risk_reason,
      is_override: false,
      shift: {
        id: row.shift_id,
        code: '',
        date: row.date,
        period: row.period,
        planned_duration_hours: row.planned_duration_hours,
        status: row.shift_status
      }
    }));
  }

  async createAssignment(data: Omit<Assignment, 'id' | 'created_at'>): Promise<Assignment> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO assignments (id, shift_id, equipment_id, operator_id, status, risk_reason, is_override, override_by, override_reason, override_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        data.shift_id,
        data.equipment_id,
        data.operator_id,
        data.status,
        data.risk_reason || null,
        data.is_override,
        data.override_by || null,
        data.override_reason || null,
        data.override_at || null
      ]
    );
    return res.rows[0];
  }

  async updateAssignmentStatus(
    id: string,
    status: Assignment['status'],
    riskReason?: string | null
  ): Promise<Assignment> {
    const res = await this.pool.query(
      `UPDATE assignments SET status = $1, risk_reason = $2 WHERE id = $3 RETURNING *`,
      [status, riskReason ?? null, id]
    );
    if (res.rows.length === 0) throw new Error(`Asignación con ID ${id} no encontrada.`);
    return res.rows[0];
  }
}

export class PostgresMaintenanceRepository implements IMaintenanceRepository {
  constructor(private pool: pkg.Pool) {}

  async findAll(): Promise<MaintenanceRecord[]> {
    const res = await this.pool.query(`
      SELECT id, equipment_id, date, horometer_at_maintenance::float, performed_by, notes, maintenance_type, created_at
      FROM maintenance_records ORDER BY date DESC
    `);
    return res.rows;
  }

  async findByEquipmentId(equipmentId: string): Promise<MaintenanceRecord[]> {
    const res = await this.pool.query(
      `SELECT id, equipment_id, date, horometer_at_maintenance::float, performed_by, notes, maintenance_type, created_at
       FROM maintenance_records WHERE equipment_id = $1 ORDER BY date DESC`,
      [equipmentId]
    );
    return res.rows;
  }

  async create(data: Omit<MaintenanceRecord, 'id' | 'created_at'>): Promise<MaintenanceRecord> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO maintenance_records (id, equipment_id, horometer_at_maintenance, performed_by, notes, maintenance_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, equipment_id, date, horometer_at_maintenance::float, performed_by, notes, maintenance_type, created_at`,
      [
        id,
        data.equipment_id,
        data.horometer_at_maintenance,
        data.performed_by,
        data.notes,
        data.maintenance_type
      ]
    );
    return res.rows[0];
  }
}

export class PostgresAuditRepository implements IAuditRepository {
  constructor(private pool: pkg.Pool) {}

  async log(audit: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, action, entity_type, entity_id, details, performed_by, created_at`,
      [
        id,
        audit.action,
        audit.entity_type,
        audit.entity_id,
        JSON.stringify(audit.details),
        audit.performed_by
      ]
    );
    await this.pool.query(`INSERT INTO outbox_events(id,topic,payload) VALUES ($1,$2,$3)`, [
      id,
      audit.action,
      JSON.stringify({ ...audit, id, created_at: res.rows[0].created_at })
    ]);
    return {
      ...res.rows[0],
      details: typeof res.rows[0].details === 'string' ? JSON.parse(res.rows[0].details) : res.rows[0].details
    };
  }

  async findAll(limit: number = 100): Promise<AuditLog[]> {
    const res = await this.pool.query(
      `SELECT id, action, entity_type, entity_id, details, performed_by, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map((row) => ({
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details
    }));
  }
}
