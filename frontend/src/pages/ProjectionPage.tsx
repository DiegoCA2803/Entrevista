import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Truck, 
  Activity,
  RefreshCw
} from 'lucide-react';
import { ProjectionItem } from '../types.js';
import { api } from '../services/api.js';

interface ProjectionPageProps {
  onRefresh: () => void;
}

export const ProjectionPage: React.FC<ProjectionPageProps> = ({ onRefresh }) => {
  const [projection, setProjection] = useState<ProjectionItem[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [isDegraded, setIsDegraded] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const fetchProjection = async (dateRef?: string) => {
    setLoading(true);
    try {
      const data = await api.get7DayProjection(dateRef || startDate);
      setProjection(data.projection);
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setIsDegraded(data.isDegraded);
      setWarningMsg(data.warning);
    } catch (err: any) {
      console.error('Error fetching projection:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjection();
  }, []);

  const handleDateChange = (newDate: string) => {
    setStartDate(newDate);
    fetchProjection(newDate);
  };

  const criticalCount = projection.filter(p => p.will_reach_maintenance).length;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-amber-400" />
            <span>Proyección Analítica de Mantenimiento a 7 Días</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cálculo proyectivo de uso según los turnos programados en el horizonte futuro (Regla 12).
          </p>
        </div>

        {/* Selector de Fecha Base y Estado SOA */}
        <div className="flex items-center space-x-3 self-start md:self-auto">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Fecha Base:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>

          <button
            onClick={() => fetchProjection()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
            title="Recalcular proyección"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Banner de Degradación Elegante (SOA Resilience) */}
      {isDegraded && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-amber-400 animate-pulse flex-shrink-0" />
            <div>
              <span className="font-bold text-amber-300">Modo de Degradación Elegante Activado (Graceful Degradation):</span>
              <p className="text-[11px] text-amber-200/90">{warningMsg || 'Servicio de simulación en fallback lineal seguro.'}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-100 text-[10px] font-bold uppercase">
            SOA Resiliente
          </span>
        </div>
      )}

      {/* Resumen de Hallazgos Proyectados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-black text-amber-400">{criticalCount}</span>
            <p className="text-xs text-slate-400">Equipos que alcanzarán PM</p>
            <span className="text-[10px] text-amber-300 font-medium">Entre {startDate} y {endDate}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-black text-slate-100">
              {projection.reduce((acc, p) => acc + p.projected_scheduled_hours_7days, 0)} hrs
            </span>
            <p className="text-xs text-slate-400">Horas Totales Programadas</p>
            <span className="text-[10px] text-slate-500">Demanda de flota a 7 días</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-400">
              {projection.filter(p => !p.will_reach_maintenance).length}
            </span>
            <p className="text-xs text-slate-400">Equipos con Margen Seguro</p>
            <span className="text-[10px] text-emerald-300 font-medium">Sin riesgo de bloqueo en 7 días</span>
          </div>
        </div>
      </div>

      {/* Tabla de Proyección Detallada */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <span>Proyección Detallada Equipo por Equipo (Ventana: {startDate} al {endDate})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Calculado acumulando las horas de cada asignación en turnos futuros.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-semibold">Equipo Minero</th>
                <th className="pb-3 font-semibold">Horómetro Actual</th>
                <th className="pb-3 font-semibold">Umbral Próximo PM</th>
                <th className="pb-3 font-semibold">Margen Restante</th>
                <th className="pb-3 font-semibold">Turnos Programados (7d)</th>
                <th className="pb-3 font-semibold">Horas Programadas</th>
                <th className="pb-3 font-semibold">Horómetro Proyectado</th>
                <th className="pb-3 font-semibold">¿Alcanzará PM?</th>
                <th className="pb-3 font-semibold">Turno Crítico de Cruce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {projection.map((item) => {
                const isCritical = item.will_reach_maintenance;
                return (
                  <tr
                    key={item.equipment_id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isCritical ? 'bg-red-500/5' : ''
                    }`}
                  >
                    {/* Código y Nombre */}
                    <td className="py-3">
                      <div className="flex items-center space-x-2">
                        <Truck className={`w-4 h-4 ${isCritical ? 'text-amber-400' : 'text-slate-400'}`} />
                        <div>
                          <span className="font-mono font-bold text-slate-100">{item.equipment_code}</span>
                          <p className="text-[10px] text-slate-400">{item.equipment_name} [{item.equipment_type}]</p>
                        </div>
                      </div>
                    </td>

                    {/* Horómetro Actual */}
                    <td className="py-3 font-mono font-semibold text-slate-200">
                      {item.current_horometer}h
                    </td>

                    {/* Umbral PM */}
                    <td className="py-3 font-mono text-slate-400">
                      {item.next_maintenance_threshold}h
                      <span className="text-[10px] text-slate-500 block">Int: {item.maintenance_interval_hours}h</span>
                    </td>

                    {/* Horas Restantes */}
                    <td className="py-3 font-mono font-bold">
                      <span className={item.hours_remaining_until_pm <= 0 ? 'text-red-400' : item.hours_remaining_until_pm <= 15 ? 'text-amber-400' : 'text-emerald-400'}>
                        {item.hours_remaining_until_pm}h
                      </span>
                    </td>

                    {/* Turnos Programados */}
                    <td className="py-3 text-slate-300 font-semibold">
                      {item.scheduled_shifts_count} turno(s)
                    </td>

                    {/* Horas Programadas */}
                    <td className="py-3 font-mono font-bold text-blue-400">
                      +{item.projected_scheduled_hours_7days}h
                    </td>

                    {/* Horómetro Proyectado */}
                    <td className="py-3 font-mono font-black text-slate-100">
                      {item.projected_total_horometer}h
                    </td>

                    {/* ¿Alcanzará Mantenimiento? */}
                    <td className="py-3">
                      {isCritical ? (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 flex items-center space-x-1 w-max">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          <span>SÍ (BLOQUEO)</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 w-max">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>NO (SEGURO)</span>
                        </span>
                      )}
                    </td>

                    {/* Turno Crítico */}
                    <td className="py-3">
                      {item.critical_shift_date ? (
                        <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono font-bold text-amber-300">
                          {item.critical_shift_date} ({item.critical_shift_period})
                        </div>
                      ) : isCritical && item.current_horometer >= item.next_maintenance_threshold ? (
                        <span className="text-[10px] text-red-400 font-semibold">Ya Bloqueado / Umbral Cruzado</span>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">No previsto en 7d</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
