export type EquipmentType =
  'CAMION_ACARREO' | 'EXCAVADORA' | 'PERFORADORA' | 'CARGADOR_FRONTAL' | 'TRACTOR_ORUGA';

export type EquipmentStatus = 'DISPONIBLE' | 'BLOQUEADO' | 'EN_MANTENIMIENTO';

export type ShiftPeriod = 'DIA' | 'NOCHE';

export type ShiftStatus = 'PROGRAMADO' | 'EN_CURSO' | 'CERRADO' | 'CANCELADO';

export type AssignmentStatus = 'PROGRAMADA' | 'EN_RIESGO' | 'COMPLETADA' | 'CANCELADA';

export interface Equipment {
  id: string;
  code: string;
  name: string;
  type: EquipmentType;
  horometer: number;
  maintenance_interval_hours: number;
  last_maintenance_horometer: number;
  status: EquipmentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Operator {
  id: string;
  code: string;
  name: string;
  document_id: string;
  is_active: boolean;
  created_at?: string;
  certifications?: Certification[];
}

export interface Certification {
  id: string;
  operator_id: string;
  equipment_type: EquipmentType;
  issued_date: string;
  expiration_date: string;
  institution?: string;
}

export interface Shift {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD
  period: ShiftPeriod;
  planned_duration_hours: number;
  status: ShiftStatus;
  actual_duration_hours?: number | null;
  closed_at?: string | null;
  closed_by?: string | null;
  notes?: string | null;
  created_at?: string;
  assignments?: Assignment[];
}

export interface Assignment {
  id: string;
  shift_id: string;
  equipment_id: string;
  operator_id: string;
  status: AssignmentStatus;
  risk_reason?: string | null;
  is_override: boolean;
  override_by?: string | null;
  override_reason?: string | null;
  override_at?: string | null;
  created_at?: string;
  // Joined fields for UI convenience
  equipment?: Equipment;
  operator?: Operator;
  shift?: Shift;
}

export interface MaintenanceRecord {
  id: string;
  equipment_id: string;
  date: string;
  horometer_at_maintenance: number;
  performed_by: string;
  notes: string;
  maintenance_type: 'PREVENTIVO' | 'CORRECTIVO';
  created_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  performed_by: string;
  created_at: string;
}

export interface AssignmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  can_override: boolean;
}

export interface ProjectionItem {
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  equipment_type: EquipmentType;
  current_horometer: number;
  last_maintenance_horometer: number;
  maintenance_interval_hours: number;
  next_maintenance_threshold: number;
  hours_remaining_until_pm: number;
  projected_scheduled_hours_7days: number;
  projected_total_horometer: number;
  will_reach_maintenance: boolean;
  critical_shift_date?: string | null;
  critical_shift_period?: ShiftPeriod | null;
  scheduled_shifts_count: number;
  status: EquipmentStatus;
}
