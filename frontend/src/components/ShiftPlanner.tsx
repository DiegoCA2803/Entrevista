import { useState } from 'react';
import { CalendarDays, Sun, Moon, Plus, Trash2, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';
import { Equipment, Operator, Shift } from '../types';
import { api } from '../services/api';
import { Modal, ErrorBox, today, labels, num } from './ui';

export function ShiftPlanner({
  equipment,
  operators,
  shifts,
  onClose,
  onSuccess
}: {
  equipment: Equipment[];
  operators: Operator[];
  shifts: Shift[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState<'DIA' | 'NOCHE'>('DIA');
  const [hours, setHours] = useState(8);
  const [notes, setNotes] = useState('');
  const [pairs, setPairs] = useState([{ equipment_id: '', operator_id: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const start = new Date(`${date}T${period === 'DIA' ? '06' : '18'}:00:00-05:00`).getTime();
  const last =
    Number.isFinite(start) && Number.isFinite(hours)
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(
          new Date(start + hours * 3600000 - 1)
        )
      : date;
  const duplicate = shifts.some((s) => s.date === date && s.period === period);
  const setPair = (i: number, field: string, value: string) =>
    setPairs(
      pairs.map((p, index) =>
        index === i ? { ...p, [field]: value, ...(field === 'equipment_id' ? { operator_id: '' } : {}) } : p
      )
    );
  const eligible = (op: Operator, eq?: Equipment) =>
    !!eq &&
    op.is_active &&
    op.certifications?.some(
      (c) => c.equipment_type === eq.type && c.issued_date <= date && c.expiration_date >= last
    );
  return (
    <Modal
      title="Programar turno"
      subtitle="Define la jornada y asigna tus recursos en un solo paso."
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await api.createShift({ date, period, planned_duration_hours: hours, notes, assignments: pairs });
            onSuccess();
            onClose();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="section-label">
            <span>01</span> Datos de la jornada
          </div>
          <div className="form-grid three">
            <label>
              Fecha del turno
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Jornada
              <div className="segmented">
                <button
                  type="button"
                  className={period === 'DIA' ? 'selected' : ''}
                  aria-label="Jornada de día"
                  onClick={() => setPeriod('DIA')}
                >
                  <Sun size={16} /> Día
                </button>
                <button
                  type="button"
                  className={period === 'NOCHE' ? 'selected' : ''}
                  aria-label="Jornada de noche"
                  onClick={() => setPeriod('NOCHE')}
                >
                  <Moon size={16} /> Noche
                </button>
              </div>
            </label>
            <label>
              Duración planificada
              <input
                type="number"
                required
                min="0.5"
                max="24"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.valueAsNumber)}
              />
            </label>
          </div>
          <p className="field-hint">
            <CalendarDays size={14} /> Inicio a las {period === 'DIA' ? '06:00' : '18:00'} · Hora de Perú ·{' '}
            {num(hours || 0)} horas por equipo
          </p>
          {duplicate && (
            <div className="notice warning">
              <AlertTriangle size={18} /> Ya existe un turno en esta fecha y jornada. Selecciona otra
              combinación.
            </div>
          )}
          <div className="section-heading">
            <div className="section-label">
              <span>02</span> Equipos y operadores
            </div>
            <span className="muted">
              {pairs.length} asignación{pairs.length > 1 ? 'es' : ''}
            </span>
          </div>
          <div className="assignment-rows">
            {pairs.map((pair, i) => {
              const eq = equipment.find((e) => e.id === pair.equipment_id);
              const remaining = eq
                ? eq.last_maintenance_horometer + eq.maintenance_interval_hours - eq.horometer
                : 0;
              return (
                <div className="assignment-row" key={i}>
                  <div className="pair-number">{String(i + 1).padStart(2, '0')}</div>
                  <div className="pair-fields">
                    <div className="form-grid">
                      <label>
                        Equipo minero
                        <select
                          required
                          value={pair.equipment_id}
                          onChange={(e) => setPair(i, 'equipment_id', e.target.value)}
                        >
                          <option value="">Seleccionar equipo</option>
                          {equipment.map((eq) => (
                            <option
                              key={eq.id}
                              value={eq.id}
                              disabled={
                                eq.status !== 'DISPONIBLE' ||
                                pairs.some((p, j) => j !== i && p.equipment_id === eq.id)
                              }
                            >
                              {eq.code} · {labels[eq.type]}
                              {eq.status !== 'DISPONIBLE' ? ` · ${labels[eq.status]}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Operador certificado
                        <select
                          required
                          disabled={!eq}
                          value={pair.operator_id}
                          onChange={(e) => setPair(i, 'operator_id', e.target.value)}
                        >
                          <option value="">Seleccionar operador</option>
                          {operators.map((op) => (
                            <option
                              key={op.id}
                              value={op.id}
                              disabled={
                                !eligible(op, eq) || pairs.some((p, j) => j !== i && p.operator_id === op.id)
                              }
                            >
                              {op.name}
                              {!eligible(op, eq) ? ' · No habilitado' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {eq && (
                      <div className={`pair-hint ${remaining <= hours ? 'warn-text' : ''}`}>
                        {remaining <= hours ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{' '}
                        {eq.code}: {num(eq.horometer)} h de uso · {num(remaining)} h hasta mantenimiento
                        {remaining <= hours ? ' · Alcanzará el umbral durante este turno.' : ''}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={pairs.length === 1}
                    aria-label={`Eliminar asignación ${i + 1}`}
                    onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="button ghost"
            disabled={pairs.length >= 50}
            onClick={() => setPairs([...pairs, { equipment_id: '', operator_id: '' }])}
          >
            <Plus size={17} /> Agregar otra asignación
          </button>
          <label className="notes-field">
            Observaciones operativas
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Frente de trabajo, objetivos de producción o indicaciones de seguridad…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <ErrorBox error={error} />
          <div className="notice info">
            <CheckCircle2 size={18} />
            <span>
              Validaremos disponibilidad, cruces de horario y certificaciones para toda la jornada antes de
              guardar.
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <span>
            {pairs.length} equipos · {num((hours || 0) * pairs.length)} horas de flota
          </span>
          <div>
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button className="button primary" disabled={busy || duplicate}>
              {busy ? 'Guardando…' : 'Crear turno y asignaciones'}
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
