import {
  Equipment,
  Operator,
  Shift,
  Assignment,
  MaintenanceRecord,
  AssignmentValidationResult,
  ProjectionItem,
  HealthResponse
} from '../types.js';

const API_BASE = '/api';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public violations: string[] = []
  ) {
    super(message);
  }
}
let userScope = 'anonymous';
export function setApiUser(id: string) {
  userScope = id;
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const mutation =
    options?.method &&
    options.method !== 'GET' &&
    !endpoint.startsWith('/auth/') &&
    !endpoint.endsWith('/validate-assignment');
  const storageKey = `minefleet:request:${userScope}:${endpoint}:${options?.body || ''}`;
  let key = mutation ? sessionStorage.getItem(storageKey) : null;
  if (mutation && !key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'MineFleet');
  if (key) headers.set('Idempotency-Key', key);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      if (attempt === 2)
        throw new ApiError(
          'No hay conexión con el servidor. Conservamos la clave de esta operación; puedes volver a intentarlo sin duplicarla.',
          0
        );
    }
    if (response && response.status < 500) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response) throw new ApiError('Servidor no disponible.', 503);
  const data = await response.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
  if (mutation && response.status < 500 && response.status !== 401) sessionStorage.removeItem(storageKey);

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Error ${response.status}: ${response.statusText}`;
    if (response.status === 401 && !endpoint.startsWith('/auth/'))
      window.dispatchEvent(new Event('minefleet:unauthorized'));
    throw new ApiError(errorMsg, response.status, data.violations || []);
  }

  return data.data !== undefined ? data.data : data;
}

export const api = {
  login: (email: string, password: string) =>
    fetchApi<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => fetchApi<User>('/auth/me'),
  logout: () => fetchApi('/auth/logout', { method: 'POST', body: '{}' }),
  getOperations: () => fetchApi<Operations>('/operations'),
  getAudit: () => fetchApi<AuditEvent[]>('/audit-logs'),
  retryEvent: (id: string) => fetchApi(`/operations/retry/${id}`, { method: 'POST', body: '{}' }),
  createEquipment: (payload: unknown) =>
    fetchApi('/equipment', { method: 'POST', body: JSON.stringify(payload) }),
  createOperator: (payload: unknown) =>
    fetchApi('/operators', { method: 'POST', body: JSON.stringify(payload) }),
  addCertification: (id: string, payload: unknown) =>
    fetchApi(`/operators/${id}/certifications`, { method: 'POST', body: JSON.stringify(payload) }),
  // Equipos
  getEquipment: () => fetchApi<Equipment[]>('/equipment'),
  getEquipmentById: (id: string) => fetchApi<Equipment>(`/equipment/${id}`),

  // Operadores
  getOperators: () => fetchApi<Operator[]>('/operators'),

  // Turnos
  getShifts: () => fetchApi<Shift[]>('/shifts'),
  getShiftById: (id: string) => fetchApi<Shift>(`/shifts/${id}`),
  createShift: (payload: {
    date: string;
    period: 'DIA' | 'NOCHE';
    planned_duration_hours?: number;
    notes?: string;
    assignments?: Array<{ equipment_id: string; operator_id: string }>;
  }) =>
    fetchApi<Shift>('/shifts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Asignaciones y validación exhaustiva (Regla 11)
  validateAssignment: (shiftId: string, equipmentId: string, operatorId: string) =>
    fetchApi<AssignmentValidationResult>(`/shifts/${shiftId}/validate-assignment`, {
      method: 'POST',
      body: JSON.stringify({ equipment_id: equipmentId, operator_id: operatorId })
    }),

  createAssignment: (
    shiftId: string,
    equipmentId: string,
    operatorId: string,
    override?: { is_override: boolean; override_by: string; override_reason: string }
  ) =>
    fetchApi<Assignment>(`/shifts/${shiftId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({
        equipment_id: equipmentId,
        operator_id: operatorId,
        is_override: override?.is_override,
        override_by: override?.override_by,
        override_reason: override?.override_reason
      })
    }),

  // Cierre de Turno (Regla 10)
  closeShift: (shiftId: string, actualDurationHours: number, closedBy: string, notes?: string) =>
    fetchApi<{
      shift: Shift;
      affectedEquipment: Equipment[];
      blockedEquipment: Equipment[];
      flaggedUpcomingAssignmentsCount: number;
    }>(`/shifts/${shiftId}/close`, {
      method: 'POST',
      body: JSON.stringify({
        actual_duration_hours: actualDurationHours,
        closed_by: closedBy,
        notes
      })
    }),

  // Mantenimiento (Reglas 2 y 3)
  getMaintenanceHistory: () => fetchApi<MaintenanceRecord[]>('/maintenance'),
  registerMaintenance: (payload: {
    equipment_id: string;
    performed_by: string;
    notes: string;
    maintenance_type?: 'PREVENTIVO' | 'CORRECTIVO';
    horometer_at_maintenance?: number;
  }) =>
    fetchApi<{ equipment: Equipment; record: MaintenanceRecord; restoredAssignmentsCount: number }>(
      '/maintenance',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),

  // Proyección a 7 Días (Regla 12 + Resiliencia)
  get7DayProjection: (referenceDate?: string) =>
    fetchApi<{
      projection: ProjectionItem[];
      startDate: string;
      endDate: string;
      isDegraded: boolean;
      warning?: string;
    }>(`/projection${referenceDate ? `?reference_date=${referenceDate}` : ''}`),

  // Salud del Sistema y Demostración
  getHealth: () => fetchApi<HealthResponse>('/health')
};

export type User = { id: string; email: string; name: string; role: 'SUPERVISOR' | 'CONSULTA' };
export type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  performed_by: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type QueueEvent = {
  id: string;
  topic: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  available_at: string;
  delivered_at: string | null;
};
export type Operations = {
  persistent: boolean;
  configured: boolean;
  counts: Record<string, number>;
  events: QueueEvent[];
  lastDelivery: string | null;
};
