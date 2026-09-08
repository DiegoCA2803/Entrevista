import { useState } from 'react';
import {
  Truck,
  Users,
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Wrench,
  AlertTriangle,
  Clock3,
  Plus,
  Sun,
  Moon,
  Activity,
  ShieldCheck,
  RotateCw,
  CheckCircle2
} from 'lucide-react';
import { Equipment, Operator, Shift, ProjectionItem, MaintenanceRecord } from '../types';
import { AuditEvent, Operations } from '../services/api';
import { Badge, Empty, SearchInput, dateLabel, num, today, labels } from '../components/ui';

export type Action = {
  kind: 'equipment' | 'operator' | 'certification' | 'maintenance' | 'close' | 'assignment' | 'cancel';
  equipment?: Equipment;
  operator?: Operator;
  shift?: Shift;
  assignmentId?: string;
};
export type PageData = {
  equipment: Equipment[];
  operators: Operator[];
  shifts: Shift[];
  projection: ProjectionItem[];
  maintenance: MaintenanceRecord[];
  audit: AuditEvent[];
  operations: Operations | null;
};
type Props = PageData & {
  canEdit: boolean;
  onAction: (action: Action) => void;
  navigate: (page: string) => void;
  onPlan: () => void;
};

function HoursChart({ shifts }: { shifts: Shift[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today() + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const active = shifts.filter((s) => s.date === date && ['PROGRAMADO', 'EN_CURSO'].includes(s.status));
    return {
      date,
      day: d.toLocaleDateString('es-PE', { weekday: 'short' }),
      hours: active.reduce(
        (n, s) =>
          n + s.planned_duration_hours * (s.assignments?.filter((a) => a.status !== 'CANCELADA').length || 0),
        0
      )
    };
  });
  const max = Math.max(20, ...days.map((d) => d.hours));
  return (
    <div
      className="chart-area"
      role="img"
      aria-label={`Horas de flota programadas: ${days.map((d) => `${d.day} ${d.hours} horas`).join(', ')}`}
    >
      <div className="chart-scale">
        {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((n, i) => (
          <span key={i}>{num(n)}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        {days.map((d, i) => (
          <div className="chart-column" key={d.date}>
            <div
              className={`chart-bar ${i === 0 ? 'current' : ''}`}
              style={{ height: `${Math.max(1, (d.hours / max) * 100)}%` }}
            >
              <span>{num(d.hours)} h</span>
            </div>
            <label>
              {i === 0 ? 'Hoy' : d.day}
              <small>{d.date.slice(8)}</small>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
export function Dashboard(props: Props) {
  const { equipment, operators, shifts, projection, navigate, onAction, canEdit } = props;
  const available = equipment.filter((e) => e.status === 'DISPONIBLE').length;
  const blocked = equipment.filter((e) => e.status === 'BLOQUEADO').length;
  const workshop = equipment.filter((e) => e.status === 'EN_MANTENIMIENTO').length;
  const upcoming = shifts.filter((s) => s.status === 'PROGRAMADO' || s.status === 'EN_CURSO');
  const risk = upcoming.flatMap((s) => s.assignments || []).filter((a) => a.status === 'EN_RIESGO').length;
  const critical = projection.filter((p) => p.will_reach_maintenance);
  const certExpired = operators.filter(
    (op) => !op.certifications?.some((c) => c.issued_date <= today() && c.expiration_date >= today())
  ).length;
  const metrics = [
    {
      label: 'Equipos disponibles',
      value: `${available}`,
      suffix: `/ ${equipment.length}`,
      detail: 'Disponibilidad de la flota',
      icon: Truck,
      color: 'green',
      percent: equipment.length ? (available / equipment.length) * 100 : 0
    },
    {
      label: 'Turnos programados',
      value: upcoming.length,
      suffix: '',
      detail: `${upcoming.filter((s) => s.date === today()).length} jornadas para hoy`,
      icon: CalendarDays,
      color: 'blue'
    },
    {
      label: 'Mantenimiento próximo',
      value: critical.length,
      suffix: '',
      detail: 'Equipos en umbral o proyección a 7 días',
      icon: Wrench,
      color: 'amber'
    },
    {
      label: 'Operadores registrados',
      value: operators.length,
      suffix: '',
      detail: certExpired ? `${certExpired} sin certificación vigente` : 'Certificaciones al día',
      icon: Users,
      color: 'purple'
    }
  ];
  return (
    <>
      <div className="stats-grid">
        {metrics.map((m) => (
          <article className="stat-card" key={m.label}>
            <div className="stat-top">
              <span>{m.label}</span>
              <div className={`stat-icon ${m.color}`}>
                <m.icon size={19} />
              </div>
            </div>
            <div className="stat-value">
              {m.value}
              <span>{m.suffix}</span>
            </div>
            <div className="stat-detail">
              {m.percent !== undefined ? (
                <span className="tiny-progress">
                  <i style={{ width: `${m.percent}%` }} />
                </span>
              ) : (
                <span className={`status-dot ${m.color}`} />
              )}{' '}
              {m.detail}
            </div>
          </article>
        ))}
      </div>
      {risk > 0 && (
        <div className="risk-banner">
          <AlertTriangle size={19} />
          <div>
            <strong>{risk} asignaciones requieren revisión</strong>
            <span>
              Hay equipos bloqueados en turnos programados. Registra su mantenimiento o reemplaza la
              asignación.
            </span>
          </div>
          <button onClick={() => navigate('shifts')}>
            Revisar turnos <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Carga operativa de la semana</h2>
              <p>Horas de flota según los turnos programados</p>
            </div>
            <span className="chart-legend">
              <i /> Horas planificadas
            </span>
          </div>
          <HoursChart shifts={shifts} />
          <div className="chart-caption">
            <Clock3 size={14} /> La planificación se actualiza con las asignaciones activas.
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Estado de la flota</h2>
              <p>Disponibilidad operativa actual</p>
            </div>
            <Truck size={19} className="muted" />
          </div>
          <div
            className="fleet-donut"
            style={{
              background: equipment.length
                ? `conic-gradient(var(--accent) 0 ${(available / equipment.length) * 100}%, #f4b45c ${(available / equipment.length) * 100}% ${((available + workshop) / equipment.length) * 100}%, #e67878 ${((available + workshop) / equipment.length) * 100}% 100%)`
                : 'var(--line)'
            }}
          >
            <div>
              <strong>{equipment.length}</strong>
              <span>equipos en flota</span>
            </div>
          </div>
          <div className="donut-legend">
            {[
              ['Disponible', available, 'green'],
              ['En mantenimiento', workshop, 'amber'],
              ['Bloqueado', blocked, 'red']
            ].map(([label, count, color]) => (
              <div key={label}>
                <span>
                  <i className={`status-dot ${color}`} />
                  {label}
                </span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-grid bottom">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Próximos turnos</h2>
              <p>Programación y recursos de la operación</p>
            </div>
            <button className="text-button" onClick={() => navigate('shifts')}>
              Ver todos <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Turno / fecha</th>
                  <th>Recursos</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.slice(0, 5).map((s) => (
                  <tr key={s.id} onClick={() => navigate('shifts')} className="clickable">
                    <td>
                      <div className="cell-with-icon">
                        <span className={`resource-icon ${s.period === 'DIA' ? 'amber' : 'blue'}`}>
                          {s.period === 'DIA' ? <Sun size={17} /> : <Moon size={17} />}
                        </span>
                        <div>
                          <strong>{s.period === 'DIA' ? 'Jornada de día' : 'Jornada de noche'}</strong>
                          <small>
                            {dateLabel(s.date)} · {s.period === 'DIA' ? '06:00' : '18:00'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{s.assignments?.filter((a) => a.status !== 'CANCELADA').length || 0} equipos</td>
                    <td>{num(s.planned_duration_hours)} h</td>
                    <td>
                      <Badge
                        status={s.assignments?.some((a) => a.status === 'EN_RIESGO') ? 'EN_RIESGO' : s.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!upcoming.length && <Empty>No hay turnos programados.</Empty>}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Atención prioritaria</h2>
              <p>Planifica el siguiente mantenimiento</p>
            </div>
            <span className="count-pill">{critical.length}</span>
          </div>
          <div className="priority-list">
            {critical.slice(0, 4).map((p) => (
              <div key={p.equipment_id} className="priority-item">
                <span className={`resource-icon ${p.status === 'BLOQUEADO' ? 'red' : 'amber'}`}>
                  <Wrench size={17} />
                </span>
                <div>
                  <strong>{p.equipment_code}</strong>
                  <p>
                    {p.status === 'BLOQUEADO'
                      ? 'Mantenimiento requerido'
                      : `${num(p.hours_remaining_until_pm)} h hasta mantenimiento`}
                  </p>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${Math.min(100, ((p.current_horometer - p.last_maintenance_horometer) / p.maintenance_interval_hours) * 100)}%`
                      }}
                    />
                  </div>
                </div>
                {canEdit && (
                  <button
                    aria-label={`Mantenimiento de ${p.equipment_code}`}
                    className="icon-button"
                    onClick={() =>
                      onAction({
                        kind: 'maintenance',
                        equipment: equipment.find((e) => e.id === p.equipment_id)
                      })
                    }
                  >
                    <ArrowUpRight size={18} />
                  </button>
                )}
              </div>
            ))}
            {!critical.length && <Empty>Sin mantenimientos próximos.</Empty>}
          </div>
          <button className="panel-link" onClick={() => navigate('projection')}>
            Ver proyección de 7 días <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}

export function Shifts({ shifts, canEdit, onAction, onPlan }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = shifts.filter(
    (s) =>
      (filter === 'all' ||
        (filter === 'risk' ? s.assignments?.some((a) => a.status === 'EN_RIESGO') : s.status === filter)) &&
      `${s.code} ${s.notes || ''} ${s.assignments?.map((a) => a.operator?.name + ' ' + a.equipment?.code).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <>
      <div className="list-toolbar">
        <div className="filter-tabs">
          {[
            ['all', 'Todos'],
            ['PROGRAMADO', 'Programados'],
            ['risk', 'En riesgo'],
            ['CERRADO', 'Cerrados']
          ].map(([key, label]) => (
            <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar turno, equipo u operador…" />
      </div>
      <div className="shift-list">
        {filtered.map((s) => (
          <section className="panel shift-card" key={s.id}>
            <header>
              <div className="cell-with-icon">
                <span className={`resource-icon large ${s.period === 'DIA' ? 'amber' : 'blue'}`}>
                  {s.period === 'DIA' ? <Sun size={23} /> : <Moon size={23} />}
                </span>
                <div>
                  <h2>
                    {dateLabel(s.date)} · Jornada de {s.period === 'DIA' ? 'día' : 'noche'}
                  </h2>
                  <p>
                    {s.code} <span>·</span> {s.period === 'DIA' ? '06:00' : '18:00'} <span>·</span>{' '}
                    {num(s.planned_duration_hours)} h planificadas
                  </p>
                </div>
              </div>
              <div className="actions">
                <Badge status={s.status} />
                {canEdit && ['PROGRAMADO', 'EN_CURSO'].includes(s.status) && (
                  <>
                    <button
                      className="button secondary small"
                      onClick={() => onAction({ kind: 'assignment', shift: s })}
                    >
                      <Plus size={15} /> Recurso
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => onAction({ kind: 'close', shift: s })}
                    >
                      <CheckCircle2 size={15} /> Cerrar turno
                    </button>
                  </>
                )}
              </div>
            </header>
            {s.notes && <p className="shift-notes">{s.notes}</p>}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Operador</th>
                    <th>Horómetro actual</th>
                    <th>Asignación</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {s.assignments?.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.equipment?.code}</strong>
                        <small>{labels[a.equipment?.type || '']}</small>
                      </td>
                      <td>
                        <strong>{a.operator?.name}</strong>
                        <small>{a.operator?.code}</small>
                      </td>
                      <td>{num(a.equipment?.horometer || 0)} h</td>
                      <td>
                        <Badge status={a.status} />
                        {a.risk_reason && <small className="warn-text risk-reason">{a.risk_reason}</small>}
                      </td>
                      {canEdit && (
                        <td>
                          {['PROGRAMADA', 'EN_RIESGO'].includes(a.status) && s.status !== 'CERRADO' && (
                            <button
                              className="text-button danger"
                              onClick={() => onAction({ kind: 'cancel', shift: s, assignmentId: a.id })}
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!s.assignments?.length && <Empty>Este turno todavía no tiene recursos asignados.</Empty>}
            </div>
            {s.status === 'CERRADO' && (
              <footer className="shift-closed">
                <CheckCircle2 size={16} /> Cerrado con {num(s.actual_duration_hours || 0)} h efectivas ·
                Responsable: {s.closed_by}
              </footer>
            )}
          </section>
        ))}
      </div>
      {!filtered.length && (
        <Empty>
          No hay turnos con estos filtros.
          {canEdit && (
            <button className="button primary" onClick={onPlan}>
              <Plus size={17} /> Programar turno
            </button>
          )}
        </Empty>
      )}
    </>
  );
}

export function Fleet({ equipment, maintenance, canEdit, onAction }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = equipment.filter(
    (e) =>
      (status === 'all' || e.status === status) &&
      `${e.code} ${e.name} ${labels[e.type]}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <div className="list-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar equipo o código…" />
        <div className="actions">
          <select aria-label="Filtrar estado" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos los estados</option>
            {['DISPONIBLE', 'BLOQUEADO', 'EN_MANTENIMIENTO'].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
          {canEdit && (
            <button className="button primary" onClick={() => onAction({ kind: 'equipment' })}>
              <Plus size={17} /> Nuevo equipo
            </button>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Ciclo de mantenimiento</th>
                <th>Horómetro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const used = e.horometer - e.last_maintenance_horometer;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="cell-with-icon">
                        <span className="resource-icon neutral">
                          <Truck size={19} />
                        </span>
                        <div>
                          <strong>{e.code}</strong>
                          <small>{e.name}</small>
                        </div>
                      </div>
                    </td>
                    <td>{labels[e.type]}</td>
                    <td>
                      <Badge status={e.status} />
                    </td>
                    <td>
                      <div className={`cycle-cell ${used >= e.maintenance_interval_hours ? 'overdue' : ''}`}>
                        <span>
                          {num(used)} / {num(e.maintenance_interval_hours)} h
                        </span>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${Math.min(100, (used / e.maintenance_interval_hours) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="mono">{num(e.horometer)} h</td>
                    <td>
                      {canEdit && (
                        <button
                          className="button secondary small"
                          onClick={() => onAction({ kind: 'maintenance', equipment: e })}
                        >
                          <Wrench size={14} /> Mantenimiento
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty>No se encontraron equipos.</Empty>}
      </section>
      <section className="panel section-space">
        <div className="panel-header">
          <div>
            <h2>Historial de mantenimiento</h2>
            <p>Intervenciones registradas y responsables</p>
          </div>
          <Wrench size={19} className="muted" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Equipo</th>
                <th>Tipo</th>
                <th>Horómetro</th>
                <th>Responsable / observación</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.slice(0, 20).map((m) => (
                <tr key={m.id}>
                  <td>{dateLabel(m.date)}</td>
                  <td>
                    <strong>{equipment.find((e) => e.id === m.equipment_id)?.code || '—'}</strong>
                  </td>
                  <td>{m.maintenance_type === 'PREVENTIVO' ? 'Preventivo' : 'Correctivo'}</td>
                  <td>{num(m.horometer_at_maintenance)} h</td>
                  <td>
                    {m.performed_by}
                    <small>{m.notes}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!maintenance.length && <Empty>Aún no hay intervenciones registradas.</Empty>}
      </section>
    </>
  );
}

export function Operators({ operators, canEdit, onAction }: Props) {
  const [search, setSearch] = useState('');
  return (
    <>
      <div className="list-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar operador, código o documento…" />
        {canEdit && (
          <button className="button primary" onClick={() => onAction({ kind: 'operator' })}>
            <Plus size={17} /> Nuevo operador
          </button>
        )}
      </div>
      <div className="operator-grid">
        {operators
          .filter((op) =>
            `${op.name} ${op.code} ${op.document_id}`.toLowerCase().includes(search.toLowerCase())
          )
          .map((op) => (
            <section className="panel operator-card" key={op.id}>
              <header>
                <span className="operator-avatar">
                  {op.name
                    .split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')}
                </span>
                <div>
                  <h2>{op.name}</h2>
                  <p>
                    {op.code} · Doc. {op.document_id}
                  </p>
                </div>
                <span className={`status-dot ${op.is_active ? 'green' : 'red'}`} />
              </header>
              <div className="operator-certifications">
                <span className="eyebrow">CERTIFICACIONES</span>
                {op.certifications?.map((c) => {
                  const valid = c.issued_date <= today() && c.expiration_date >= today();
                  return (
                    <div key={c.id}>
                      <ShieldCheck size={17} className={valid ? 'accent-text' : 'danger'} />
                      <div>
                        <strong>{labels[c.equipment_type]}</strong>
                        <small>
                          {valid ? 'Vigente hasta' : c.issued_date > today() ? 'Vigente desde' : 'Venció el'}{' '}
                          {dateLabel(c.issued_date > today() ? c.issued_date : c.expiration_date)}{' '}
                          {c.expiration_date.slice(0, 4)}
                        </small>
                      </div>
                      <span className={`badge ${valid ? 'green' : 'red'}`}>
                        {valid ? 'Vigente' : c.issued_date > today() ? 'Futura' : 'Vencida'}
                      </span>
                    </div>
                  );
                })}
                {!op.certifications?.length && <p className="muted">Sin certificaciones registradas.</p>}
              </div>
              {canEdit && (
                <button
                  className="panel-link"
                  onClick={() => onAction({ kind: 'certification', operator: op })}
                >
                  <Plus size={16} /> Registrar certificación
                </button>
              )}
            </section>
          ))}
      </div>
    </>
  );
}

export function Projection({ projection, shifts }: Props) {
  const [onlyRisk, setOnlyRisk] = useState(false);
  const selected = onlyRisk ? projection.filter((p) => p.will_reach_maintenance) : projection;
  return (
    <>
      <div className="projection-intro">
        <div className="notice info">
          <CalendarDays size={20} />
          <div>
            <strong>Una mirada a los próximos 7 días</strong>
            <p>
              Sumamos el uso planificado a los horómetros actuales. La proyección supone que se ejecutan las
              asignaciones activas, incluidas las que requieren mantenimiento previo.
            </p>
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} /> Solo
          equipos críticos
        </label>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Equipo / estado</th>
                <th>Horas actuales</th>
                <th>Uso programado</th>
                <th>Horómetro proyectado</th>
                <th>Próximo umbral</th>
                <th>Alcanza mantenimiento</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p) => (
                <tr key={p.equipment_id}>
                  <td>
                    <strong>{p.equipment_code}</strong>
                    <small>{labels[p.equipment_type]}</small>
                    <Badge status={p.status} />
                  </td>
                  <td>{num(p.current_horometer)} h</td>
                  <td>
                    <span className="accent-text">+{num(p.projected_scheduled_hours_7days)} h</span>
                    <small>{p.scheduled_shifts_count} turnos</small>
                  </td>
                  <td>
                    <strong className={p.will_reach_maintenance ? 'danger' : ''}>
                      {num(p.projected_total_horometer)} h
                    </strong>
                  </td>
                  <td>{num(p.next_maintenance_threshold)} h</td>
                  <td>
                    {p.status === 'BLOQUEADO' ? (
                      <span className="badge red">Ya alcanzado</span>
                    ) : p.critical_shift_date ? (
                      <>
                        <span className="badge amber">{dateLabel(p.critical_shift_date)}</span>
                        <small>Jornada de {p.critical_shift_period === 'DIA' ? 'día' : 'noche'}</small>
                      </>
                    ) : (
                      <span className="muted">Fuera de la ventana</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!selected.length && <Empty>No hay equipos que coincidan.</Empty>}
      </section>
    </>
  );
}

const eventLabels: Record<string, string> = {
  EQUIPMENT_REGISTERED: 'Equipo registrado',
  OPERATOR_REGISTERED: 'Operador registrado',
  CERTIFICATION_REGISTERED: 'Certificación registrada',
  SHIFT_SCHEDULED: 'Turno programado',
  SHIFT_CLOSED: 'Turno cerrado',
  MAINTENANCE_REGISTERED: 'Mantenimiento registrado',
  ASSIGNMENT_REJECTED: 'Asignación rechazada',
  ASSIGNMENT_CANCELLED: 'Asignación cancelada',
  DELIVERY_RETRIED: 'Reintento autorizado',
  ASSIGNMENT_CREATED: 'Recurso asignado'
};
export function OperationsPage({
  operations,
  audit,
  canEdit,
  retry
}: {
  operations: Operations | null;
  audit: AuditEvent[];
  canEdit: boolean;
  retry: (id: string) => void;
}) {
  const [tab, setTab] = useState('audit');
  return (
    <>
      <div className="operations-status">
        <Activity size={20} />
        <div>
          <strong>
            {operations?.persistent ? 'Persistencia PostgreSQL activa' : 'Vista previa temporal'}
          </strong>
          <p>
            {operations?.configured
              ? 'Cola persistente con entrega y reintentos automáticos.'
              : 'Entrega externa sin configurar. Los eventos permanecen guardados para su posterior envío.'}
          </p>
        </div>
        <span className={`badge ${operations?.configured ? 'green' : 'amber'}`}>
          {operations?.configured ? 'Integración configurada' : 'Sin receptor'}
        </span>
      </div>
      <div className="stats-grid">
        {[
          ['PENDING', 'Pendientes'],
          ['PROCESSING', 'En proceso'],
          ['DELIVERED', 'Entregados'],
          ['DEAD', 'Requieren atención']
        ].map(([key, title]) => (
          <div className="stat-card" key={key}>
            <div className="stat-top">
              {title}
              <Activity size={17} />
            </div>
            <div className="stat-value">{operations?.counts[key] || 0}</div>
            <span className="stat-detail">Eventos de la operación</span>
          </div>
        ))}
      </div>
      <div className="list-toolbar">
        <div className="filter-tabs">
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Bitácora de actividad
          </button>
          <button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
            Cola de eventos
          </button>
        </div>
        <span className="muted">Últimos {tab === 'audit' ? 100 : 50} registros</span>
      </div>
      <section className="panel">
        <div className="table-scroll">
          {tab === 'audit' ? (
            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Responsable</th>
                  <th>Fecha y hora</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{eventLabels[a.action] || a.action}</strong>
                      <small className="mono">{a.id.slice(0, 8)}</small>
                    </td>
                    <td>{a.performed_by}</td>
                    <td>{new Date(a.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</td>
                    <td>
                      <details>
                        <summary>Ver registro</summary>
                        <pre>{JSON.stringify(a.details, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Evento / identificador</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th>Entrega / próximo intento</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {operations?.events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{eventLabels[e.topic] || e.topic}</strong>
                      <small className="mono">{e.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <Badge status={e.status} />
                    </td>
                    <td>{e.attempts} / 10</td>
                    <td>
                      {new Date(e.delivered_at || e.available_at).toLocaleString('es-PE', {
                        timeZone: 'America/Lima'
                      })}
                    </td>
                    <td>
                      {e.last_error && <small className="danger">{e.last_error}</small>}
                      {e.status === 'DEAD' && canEdit && (
                        <button className="button secondary small" onClick={() => retry(e.id)}>
                          <RotateCw size={14} /> Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {(tab === 'audit' ? !audit.length : !operations?.events.length) && (
          <Empty>Los eventos aparecerán aquí cuando registres operaciones.</Empty>
        )}
      </section>
      <p className="field-hint section-space">
        La bitácora conserva el responsable y los cambios. Las métricas de rendimiento están disponibles en el
        dashboard de Grafana del despliegue Docker.
      </p>
    </>
  );
}
