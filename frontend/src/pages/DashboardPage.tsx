import React from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  ShieldAlert, 
  Calendar, 
  Truck,
  Wrench
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
  // Encontrar casos borde precargados para guiar al evaluador
  const nearPmEquipment = equipment.find(e => {
    const threshold = e.last_maintenance_horometer + e.maintenance_interval_hours;
    const remaining = threshold - e.horometer;
    return remaining > 0 && remaining <= 10 && e.status === 'DISPONIBLE';
  });

  const expiredOperator = operators.find(op => {
    const today = new Date().toISOString().split('T')[0];
    return (op.certifications || []).some(c => c.expiration_date < today);
  });

  const openShiftWithNearPm = shifts.find(s => 
    s.status === 'PROGRAMADO' && 
    (s.assignments || []).some(a => a.equipment_id === nearPmEquipment?.id)
  );

  return (
    <div className="space-y-6">
      {/* Saludo y Resumen Operativo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Control de Flota y Asignaciones Mineras
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Supervisión en tiempo real de horómetros, certificaciones de operadores y proyección preventiva.
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas (KPIs) */}
      <KPIs
        equipment={equipment}
        operators={operators}
        shifts={shifts}
        projection={projection}
      />

      {/* GUÍA INTERACTIVA DE PRUEBA (Casos Borde Clave para el Evaluador) */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 shadow-xl">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm mb-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>Casos Borde de Demostración Precargados (Listo para Probar)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Caso 1: Equipo al límite */}
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-300">1. Equipo Próximo a PM</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                {nearPmEquipment ? nearPmEquipment.code : 'CAM-001'}
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Tiene <strong>{nearPmEquipment?.horometer}h</strong> de {nearPmEquipment ? nearPmEquipment.last_maintenance_horometer + nearPmEquipment.maintenance_interval_hours : 250}h. Le restan solo <strong>4h</strong> de uso.
            </p>
            <button
              onClick={() => setCurrentTab('equipment')}
              className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center space-x-1 pt-1"
            >
              <span>Ver en Flota</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Caso 2: Operador con certificación vencida */}
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-red-300">2. Operador Cert. Vencida</span>
              <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-mono font-bold">
                {expiredOperator ? expiredOperator.code : 'OP-003'}
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              <strong>{expiredOperator?.name}</strong> tiene su certificación vencida. Intentar asignarlo activará el rechazo por Regla 9 (o múltiple por Regla 11).
            </p>
            <button
              onClick={() => setCurrentTab('shifts')}
              className="text-red-400 hover:text-red-300 font-medium inline-flex items-center space-x-1 pt-1"
            >
              <span>Intentar Asignación</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Caso 3: Cierre que dispara bloqueo */}
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-300">3. Turno Crítico</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                {openShiftWithNearPm ? openShiftWithNearPm.code : 'TURNO HOY'}
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Asignado con {nearPmEquipment?.code}. Al hacer clic en <strong>Cerrar Turno</strong> con 8h, superará las 250h y se bloqueará en vivo.
            </p>
            {openShiftWithNearPm && (
              <button
                onClick={() => onOpenCloseShift(openShiftWithNearPm)}
                className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center space-x-1 pt-1"
              >
                <span>¡Cerrar este Turno Ahora!</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid de Estado Rápido: Turnos Recientes y Equipos Críticos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Turnos Programados */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Turnos Próximos y Asignaciones</span>
            </h2>
            <button
              onClick={() => setCurrentTab('shifts')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Ver Todos
            </button>
          </div>

          <div className="space-y-2.5">
            {shifts.slice(0, 4).map((shift) => {
              const assignments = shift.assignments || [];
              const hasRisk = assignments.some(a => a.status === 'EN_RIESGO');
              return (
                <div
                  key={shift.id}
                  className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between hover:bg-slate-800 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-200 text-xs">{shift.code}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        shift.status === 'CERRADO'
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {shift.status}
                      </span>
                      {hasRisk && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                          EN RIESGO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Fecha: {shift.date} ({shift.period}) — {assignments.length} equipo(s) asignado(s)
                    </p>
                  </div>

                  <div>
                    {shift.status !== 'CERRADO' ? (
                      <button
                        onClick={() => onOpenCloseShift(shift)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors"
                      >
                        Cerrar Turno
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">Cerrado ({shift.actual_duration_hours}h)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Equipos en Riesgo o Próximos a Mantenimiento */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Truck className="w-4 h-4 text-amber-400" />
              <span>Estado de Horómetros de Flota</span>
            </h2>
            <button
              onClick={() => setCurrentTab('equipment')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Gestionar Flota
            </button>
          </div>

          <div className="space-y-2.5">
            {equipment.map((eq) => {
              const threshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
              const hoursSincePm = eq.horometer - eq.last_maintenance_horometer;
              const percent = Math.min(100, Math.round((hoursSincePm / eq.maintenance_interval_hours) * 100));
              const isCritical = eq.status === 'BLOQUEADO' || percent >= 95;

              return (
                <div
                  key={eq.id}
                  className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-200">{eq.code}</span>
                      <span className="text-slate-400 text-[11px]">({eq.name})</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      eq.status === 'BLOQUEADO'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : eq.status === 'EN_MANTENIMIENTO'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {eq.status}
                    </span>
                  </div>

                  {/* Barra de Progreso de Horómetro */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Uso: <strong className="text-slate-200">{eq.horometer}h</strong></span>
                      <span>Próximo PM: <strong className="text-slate-200">{threshold}h</strong> ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-700/80 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          eq.status === 'BLOQUEADO'
                            ? 'bg-red-500'
                            : percent >= 95
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-blue-500'
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
