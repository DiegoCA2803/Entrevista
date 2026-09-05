import React from 'react';
import { 
  Calendar, 
  Truck, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  Wrench,
  User
} from 'lucide-react';
import { Equipment, Operator, Shift, ProjectionItem } from '../types.js';
import { KPIs } from '../components/KPIs.js';

interface DashboardPageProps {
  equipment: Equipment[];
  operators: Operator[];
  shifts: Shift[];
  projection: ProjectionItem[];
  setCurrentTab: (tab: string) => void;
  onOpenCloseShift: (shift: Shift) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  equipment,
  operators,
  shifts,
  projection,
  setCurrentTab,
  onOpenCloseShift
}) => {
  return (
    <div className="space-y-8">
      {/* Título y Resumen */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Panel de Control de Operaciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Supervisión en tiempo real de máquinas, operadores certificados y turnos de trabajo.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setCurrentTab('shifts')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center space-x-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Gestionar Asignaciones</span>
          </button>
        </div>
      </div>

      {/* Indicadores Clave (KPIs) */}
      <KPIs
        equipment={equipment}
        operators={operators}
        shifts={shifts}
        projection={projection}
      />

      {/* Secciones Principales Separadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Columna 1: Turnos y Asignaciones */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Turnos de Trabajo y Asignaciones</h2>
                <p className="text-xs text-slate-400">Jornadas programadas y máquinas operando</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('shifts')}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1"
            >
              <span>Ver todos los turnos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {shifts.slice(0, 4).map((shift) => {
              const assignments = shift.assignments || [];
              const isClosed = shift.status === 'CERRADO';
              const hasRisk = assignments.some(a => a.status === 'EN_RIESGO');

              return (
                <div
                  key={shift.id}
                  className={`p-4 rounded-xl border transition-all ${
                    hasRisk
                      ? 'bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/20'
                      : 'bg-slate-800/50 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white text-sm">{shift.code}</span>
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                          isClosed
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {shift.status}
                        </span>
                        {hasRisk && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                            Equipo en riesgo
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 flex items-center space-x-2">
                        <span>Fecha: <strong className="text-slate-200">{shift.date}</strong></span>
                        <span>•</span>
                        <span>Jornada: <strong className="text-slate-200">{shift.period}</strong></span>
                        <span>•</span>
                        <span>{assignments.length} asignación(es)</span>
                      </p>

                      {/* Resumen de Asignaciones */}
                      {assignments.length > 0 && (
                        <div className="pt-2 flex flex-wrap gap-2">
                          {assignments.map(a => (
                            <span key={a.id} className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-200 border border-slate-700">
                              <Truck className="w-3 h-3 text-amber-400" />
                              <strong>{a.equipment?.code}</strong>
                              <span className="text-slate-400">con</span>
                              <span>{a.operator?.name.split(' ')[0]}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="self-start sm:self-center pt-2 sm:pt-0">
                      {!isClosed ? (
                        <button
                          onClick={() => onOpenCloseShift(shift)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Cerrar Turno</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                          Completado ({shift.actual_duration_hours}h)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna 2: Estado de la Flota de Máquinas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Horómetros y Mantenimiento de Máquinas</h2>
                <p className="text-xs text-slate-400">Horas acumuladas hacia el límite de 250h</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('equipment')}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1"
            >
              <span>Ver todos los equipos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {equipment.map((eq) => {
              const threshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
              const hoursSincePm = eq.horometer - eq.last_maintenance_horometer;
              const remaining = threshold - eq.horometer;
              const percent = Math.min(100, Math.round((hoursSincePm / eq.maintenance_interval_hours) * 100));
              const isBlocked = eq.status === 'BLOQUEADO';

              return (
                <div
                  key={eq.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isBlocked
                      ? 'bg-red-500/5 border-red-500/40 ring-1 ring-red-500/20'
                      : 'bg-slate-800/50 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white text-sm">{eq.code}</span>
                        <span className="text-slate-300 font-medium">{eq.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{eq.type.replace('_', ' ')}</span>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                      isBlocked
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : eq.status === 'EN_MANTENIMIENTO'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {isBlocked ? 'BLOQUEADO' : eq.status}
                    </span>
                  </div>

                  {/* Barra de Desgaste */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">
                        Uso: <strong className="text-white">{eq.horometer} hrs</strong>
                      </span>
                      <span className={remaining <= 0 ? 'text-red-400 font-bold' : remaining <= 10 ? 'text-amber-400 font-bold' : 'text-slate-300 font-semibold'}>
                        {remaining > 0 ? `Quedan ${remaining.toFixed(1)} hrs` : 'Límite alcanzado'} (Meta: {threshold}h)
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBlocked
                            ? 'bg-red-500'
                            : percent >= 95
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
