import { useState } from 'react';
import { ShieldCheck, Check, AlertTriangle } from 'lucide-react';
import { Action, PageData } from '../pages/ControlPages';
import { api, fetchApi, User } from '../services/api';
import { Modal, ErrorBox, labels, today, num } from './ui';
type Field = {
  key: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: Array<[string, string]>;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  hint?: string;
};
export function OperationForm({
  action,
  data,
  user,
  onClose,
  onSuccess
}: {
  action: Action;
  data: PageData;
  user: User;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const types = Object.entries(labels).filter(([key]) =>
    ['CAMION_ACARREO', 'EXCAVADORA', 'PERFORADORA', 'CARGADOR_FRONTAL', 'TRACTOR_ORUGA'].includes(key)
  );
  let title = '',
    subtitle = '',
    fields: Field[] = [];
  switch (action.kind) {
    case 'equipment':
      title = 'Registrar equipo';
      subtitle = 'Incorpora un equipo a la flota. El intervalo del catálogo es de 250 h por tipo.';
      fields = [
        { key: 'code', label: 'Código del equipo', value: '' },
        { key: 'name', label: 'Nombre / modelo', value: '' },
        { key: 'type', label: 'Tipo de equipo', options: types, value: 'CAMION_ACARREO' },
        { key: 'horometer', label: 'Horómetro actual (h)', type: 'number', min: 0, value: 0 },
        {
          key: 'last_maintenance_horometer',
          label: 'Horómetro del último mantenimiento',
          type: 'number',
          min: 0,
          value: 0
        }
      ];
      break;
    case 'operator':
      title = 'Registrar operador';
      subtitle = 'Las certificaciones se registran en la ficha del operador.';
      fields = [
        { key: 'name', label: 'Nombre completo', value: '' },
        { key: 'code', label: 'Código de operador', value: '' },
        { key: 'document_id', label: 'Documento de identidad', value: '' }
      ];
      break;
    case 'certification':
      title = 'Registrar certificación';
      subtitle = action.operator?.name || '';
      fields = [
        { key: 'equipment_type', label: 'Tipo de equipo', options: types, value: 'CAMION_ACARREO' },
        { key: 'institution', label: 'Institución emisora', value: '' },
        { key: 'issued_date', label: 'Fecha de emisión', type: 'date', value: today() },
        { key: 'expiration_date', label: 'Fecha de vencimiento', type: 'date', value: '' }
      ];
      break;
    case 'maintenance':
      title = 'Registrar mantenimiento';
      subtitle = `${action.equipment?.code} · ${action.equipment?.name}`;
      fields = [
        {
          key: 'maintenance_type',
          label: 'Tipo de intervención',
          options: [
            ['PREVENTIVO', 'Preventivo'],
            ['CORRECTIVO', 'Correctivo']
          ],
          value: 'PREVENTIVO'
        },
        {
          key: 'horometer_at_maintenance',
          label: 'Horómetro real al intervenir (h)',
          type: 'number',
          min: action.equipment?.horometer,
          value: action.equipment?.horometer,
          step: 0.1
        },
        { key: 'notes', label: 'Trabajo realizado y observaciones', type: 'textarea', value: '' }
      ];
      break;
    case 'close':
      title = 'Cerrar turno';
      subtitle = `${action.shift?.code} · ${action.shift?.planned_duration_hours} horas planificadas`;
      fields = [
        {
          key: 'actual_duration_hours',
          label: 'Horas efectivamente trabajadas',
          type: 'number',
          min: 0,
          max: 24,
          step: 0.1,
          value: action.shift?.planned_duration_hours,
          hint: 'Se suman estas horas a cada equipo activo del turno.'
        },
        { key: 'notes', label: 'Observaciones del cierre', type: 'textarea', value: '', required: false }
      ];
      break;
    case 'assignment':
      title = 'Agregar recurso al turno';
      subtitle = action.shift?.code || '';
      fields = [
        {
          key: 'equipment_id',
          label: 'Equipo minero',
          options: data.equipment
            .filter((e) => e.status === 'DISPONIBLE')
            .map((e) => [e.id, `${e.code} · ${labels[e.type]}`]),
          value: ''
        },
        {
          key: 'operator_id',
          label: 'Operador',
          options: data.operators.filter((o) => o.is_active).map((o) => [o.id, o.name]),
          value: ''
        }
      ];
      break;
    case 'cancel':
      title = 'Cancelar asignación';
      subtitle = 'El recurso se liberará de este turno y se conservará el historial.';
      fields = [{ key: 'reason', label: 'Motivo de cancelación', type: 'textarea', value: '' }];
      break;
  }
  const [values, setValues] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value ?? '']))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <Modal title={title} subtitle={subtitle} busy={busy} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setBusy(true);
          try {
            let message = 'Registro guardado correctamente.';
            if (action.kind === 'equipment') await api.createEquipment(values);
            if (action.kind === 'operator') await api.createOperator(values);
            if (action.kind === 'certification') await api.addCertification(action.operator!.id, values);
            if (action.kind === 'assignment')
              await api.createAssignment(
                action.shift!.id,
                String(values.equipment_id),
                String(values.operator_id)
              );
            if (action.kind === 'cancel')
              await fetchApi(`/shifts/${action.shift!.id}/assignments/${action.assignmentId}/cancel`, {
                method: 'POST',
                body: JSON.stringify(values)
              });
            if (action.kind === 'maintenance') {
              const result = await api.registerMaintenance({
                ...values,
                equipment_id: action.equipment!.id,
                performed_by: user.email,
                notes: String(values.notes)
              });
              message = `${result.equipment.code} disponible. Próximo mantenimiento a las ${num(result.equipment.last_maintenance_horometer + result.equipment.maintenance_interval_hours)} h.`;
            }
            if (action.kind === 'close') {
              const result = await api.closeShift(
                action.shift!.id,
                Number(values.actual_duration_hours),
                user.email,
                String(values.notes)
              );
              message = `Turno cerrado. ${result.blockedEquipment.length} equipos bloqueados; ${result.flaggedUpcomingAssignmentsCount} asignaciones marcadas en riesgo.`;
            }
            onSuccess(message);
            onClose();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="form-stack">
            {fields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select
                    required={f.required !== false}
                    value={values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  >
                    <option value="">Seleccionar…</option>
                    {f.options.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    required={f.required !== false}
                    minLength={3}
                    maxLength={2000}
                    value={values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    required={f.required !== false}
                    type={f.type || 'text'}
                    min={f.min}
                    max={f.max}
                    step={f.step || 'any'}
                    maxLength={100}
                    value={values[f.key]}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [f.key]: f.type === 'number' ? e.target.valueAsNumber : e.target.value
                      })
                    }
                  />
                )}
                {f.hint && <span className="field-hint">{f.hint}</span>}
              </label>
            ))}
          </div>
          {action.kind === 'close' && (
            <div className="notice warning">
              <AlertTriangle size={18} />
              <span>
                El cierre actualizará los horómetros. Los equipos que alcancen su umbral quedarán bloqueados y
                sus turnos pendientes se marcarán en riesgo.
              </span>
            </div>
          )}
          <div className="actor-note">
            <ShieldCheck size={16} /> Responsable: <strong>{user.email}</strong>
          </div>
          <ErrorBox error={error} />
        </div>
        <footer className="modal-footer">
          <span>Registro con trazabilidad</span>
          <div>
            <button type="button" disabled={busy} className="button secondary" onClick={onClose}>
              Cancelar
            </button>
            <button disabled={busy} className="button primary">
              <Check size={16} />
              {busy ? 'Guardando…' : action.kind === 'close' ? 'Confirmar cierre' : 'Guardar registro'}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
