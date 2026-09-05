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

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Error ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data.data !== undefined ? data.data : data;
}

export const api = {
  // Equipos
  getEquipment: () => fetchApi<Equipment[]>('/equipment'),
  getEquipmentById: (id: string) => fetchApi<Equipment>(`/equipment/${id}`),

  // Operadores
  getOperators: () => fetchApi<Operator[]>('/operators'),

  // Turnos
  getShifts: () => fetchApi<Shift[]>('/shifts'),
  getShiftById: (id: string) => fetchApi<Shift>(`/shifts/${id}`),
  createShift: (payload: { date: string; period: 'DIA' | 'NOCHE'; planned_duration_hours?: number; notes?: string }) =>
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
  getHealth: () => fetchApi<HealthResponse>('/health'),
  resetDemoData: () =>
    fetchApi<{ message: string; summary: any }>('/demo/reset', {
      method: 'POST'
    })
};
