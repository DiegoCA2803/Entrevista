import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Wrench, 
  AlertOctagon, 
  CheckCircle, 
  Plus, 
  History, 
  Clock, 
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { Equipment, MaintenanceRecord, EquipmentType } from '../types.js';
import { api } from '../services/api.js';

interface EquipmentPageProps {
  equipment: Equipment[];
  onOpenMaintenanceModal: (eq: Equipment) => void;
  onRefresh: () => void;
}

export const EquipmentPage: React.FC<EquipmentPageProps> = ({
  equipment,
  onOpenMaintenanceModal,
  onRefresh
}) => {
  const [history, setHistory] = useState<MaintenanceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Nuevo equipo form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<EquipmentType>('CAMION_ACARREO');
  const [horometer, setHorometer] = useState(0);
  const [interval, setInterval] = useState(250);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const records = await api.getMaintenanceHistory();
      setHistory(records);
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await api.getEquipment(); // test
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          type,
          horometer: Number(horometer),
          maintenance_interval_hours: Number(interval)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear equipo');

      setShowCreateModal(false);
      setCode('');
      setName('');
      setHorometer(0);
      onRefresh();
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center space-x-2">
            <Truck className="w-6 h-6 text-amber-400" />
            <span>Flota de Equipos y Control de Mantenimiento</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Control de horómetros acumulados, intervalos preventivos y bloqueo automático por umbral de servicio.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Equipo</span>
        </button>
      </div>

      {/* Grid de Tarjetas de Equipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {equipment.map((eq) => {
          const threshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
          const hoursSincePm = eq.horometer - eq.last_maintenance_horometer;
          const remaining = threshold - eq.horometer;
          const percent = Math.min(100, Math.round((hoursSincePm / eq.maintenance_interval_hours) * 100));
          const isBlocked = eq.status === 'BLOQUEADO';
          const isInMaintenance = eq.status === 'EN_MANTENIMIENTO';

          return (
            <div
              key={eq.id}
              className={`rounded-2xl border ${
                isBlocked
                  ? 'bg-slate-900 border-red-500/40 ring-1 ring-red-500/30'
                  : isInMaintenance
                  ? 'bg-slate-900 border-amber-500/40 ring-1 ring-amber-500/30'
                  : 'bg-slate-900 border-slate-800'
              } p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-black text-slate-100 text-lg">{eq.code}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold uppercase">
                      {eq.type.replace('_', ' ')}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                      isBlocked
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse'
                        : isInMaintenance
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {eq.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300 font-medium mt-1">{eq.name}</p>

                {/* Métricas de Horómetro */}
                <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Horómetro Actual:</span>
                    <span className="font-mono font-bold text-slate-100">{eq.horometer} hrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Último PM:</span>
                    <span className="font-mono text-slate-300">{eq.last_maintenance_horometer} hrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Próximo Umbral PM:</span>
                    <span className="font-mono font-bold text-amber-400">{threshold} hrs</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-700 pt-1.5">
                    <span className="text-slate-400">Horas Restantes:</span>
                    <span className={`font-mono font-bold ${remaining <= 0 ? 'text-red-400' : remaining <= 15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {remaining > 0 ? remaining.toFixed(1) : '0 (Excedido)'} hrs
                    </span>
                  </div>
                </div>

                {/* Barra de Progreso de Desgaste */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>Ciclo de Mantenimiento ({eq.maintenance_interval_hours}h)</span>
                    <span className="font-semibold">{percent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isBlocked
                          ? 'bg-red-500'
                          : percent >= 95
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Botón de Acción */}
              <div>
                <button
                  onClick={() => onOpenMaintenanceModal(eq)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                    isBlocked
                      ? 'bg-red-500 hover:bg-red-400 text-slate-950 shadow-md shadow-red-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{isBlocked ? 'Registrar PM y Desbloquear' : 'Registrar Mantenimiento'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historial de Mantenimiento (Regla 3: Trazabilidad) */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <History className="w-5 h-5 text-amber-400" />
            <span>Historial y Trazabilidad de Mantenimientos Registrados</span>
          </h2>
          <span className="text-xs text-slate-400">Total: {history.length} eventos</span>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No hay mantenimientos registrados aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-semibold">Fecha y Hora</th>
                  <th className="pb-3 font-semibold">Equipo</th>
                  <th className="pb-3 font-semibold">Horómetro en PM</th>
                  <th className="pb-3 font-semibold">Tipo</th>
                  <th className="pb-3 font-semibold">Responsable</th>
                  <th className="pb-3 font-semibold">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((record) => {
                  const eq = equipment.find(e => e.id === record.equipment_id);
                  return (
                    <tr key={record.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                        {new Date(record.date).toLocaleString()}
                      </td>
                      <td className="py-2.5 font-mono font-bold text-amber-400">
                        {eq ? eq.code : record.equipment_id.substring(0, 8)}
                      </td>
                      <td className="py-2.5 font-mono font-semibold text-slate-200">
                        {record.horometer_at_maintenance} hrs
                      </td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                          {record.maintenance_type}
                        </span>
                      </td>
                      <td className="py-2.5 font-medium text-slate-200">
                        {record.performed_by}
                      </td>
                      <td className="py-2.5 text-slate-400 max-w-sm italic text-[11px]">
                        "{record.notes}"
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear Equipo */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100">Registrar Nuevo Equipo Minero</h3>
            <form onSubmit={handleCreateEquipment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Código (ej. CAM-003)</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre / Modelo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Equipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="CAMION_ACARREO">Camión de Acarreo</option>
                  <option value="EXCAVADORA">Excavadora Hidráulica</option>
                  <option value="PERFORADORA">Perforadora</option>
                  <option value="CARGADOR_FRONTAL">Cargador Frontal</option>
                  <option value="TRACTOR_ORUGA">Tractor sobre Orugas</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Horómetro Inicial</label>
                  <input
                    type="number"
                    value={horometer}
                    onChange={(e) => setHorometer(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Intervalo PM (h)</label>
                  <input
                    type="number"
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {createError && (
                <div className="p-2.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30">
                  {createError}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                >
                  Guardar Equipo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
