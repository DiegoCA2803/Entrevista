import React, { useState } from 'react';
import { 
  Calendar, 
  Plus, 
  UserCheck, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  ChevronRight,
  Filter
} from 'lucide-react';
import { Shift, Equipment, Operator } from '../types.js';
import { api } from '../services/api.js';

interface ShiftsPageProps {
  shifts: Shift[];
  equipment: Equipment[];
  operators: Operator[];
  onOpenNewAssignment: (shift: Shift) => void;
  onOpenCloseShift: (shift: Shift) => void;
  onRefresh: () => void;
}

export const ShiftsPage: React.FC<ShiftsPageProps> = ({
  shifts,
  equipment,
  operators,
  onOpenNewAssignment,
  onOpenCloseShift,
  onRefresh
}) => {
  const [isCreatingShift, setIsCreatingShift] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPeriod, setNewPeriod] = useState<'DIA' | 'NOCHE'>('DIA');
  const [newDuration, setNewDuration] = useState(8);
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);

    try {
      await api.createShift({
        date: newDate,
        period: newPeriod,
        planned_duration_hours: Number(newDuration),
        notes: newNotes
      });
      setIsCreatingShift(false);
      setNewNotes('');
      onRefresh();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center space-x-2">
            <Calendar className="w-6 h-6 text-amber-400" />
            <span>Turnos y Asignaciones Operativas</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de jornadas, validación de operador acreditado + equipo apto, y control de excepciones.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingShift(!isCreatingShift)}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isCreatingShift ? 'Cancelar' : 'Crear Nuevo Turno'}</span>
        </button>
      </div>

      {/* Modal / Formulario de Creación de Turno */}
      {isCreatingShift && (
        <form
          onSubmit={handleCreateShift}
          className="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-xl space-y-4 animate-fade-in"
        >
          <h3 className="text-sm font-bold text-amber-300">Programar Nuevo Turno Minero</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha de Turno</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Jornada</label>
              <select
                value={newPeriod}
                onChange={(e) => setNewPeriod(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:ring-2 focus:ring-amber-500"
              >
                <option value="DIA">DÍA (07:00 - 19:00)</option>
                <option value="NOCHE">NOCHE (19:00 - 07:00)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Duración Planificada (h)</label>
              <input
                type="number"
                min="1"
                max="24"
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Notas / Frente de Trabajo</label>
            <input
              type="text"
              placeholder="Ej. Frente de Carguío Banco 3, Tajo Norte"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {createError && (
            <div className="p-3 rounded-xl bg-red-500/20 text-red-300 text-xs border border-red-500/30">
              {createError}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreatingShift(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
            >
              {isSubmitting ? 'Creando...' : 'Guardar Turno'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Turnos y sus Asignaciones */}
      <div className="space-y-6">
        {shifts.map((shift) => {
          const assignments = shift.assignments || [];
          const isClosed = shift.status === 'CERRADO';
          const hasRisk = assignments.some(a => a.status === 'EN_RIESGO');

          return (
            <div
              key={shift.id}
              className={`rounded-2xl border transition-all ${
                hasRisk
                  ? 'bg-slate-900 border-amber-500/40 ring-1 ring-amber-500/20'
                  : 'bg-slate-900 border-slate-800'
              } overflow-hidden shadow-lg`}
            >
              {/* Encabezado del Turno */}
              <div className="p-5 bg-slate-800/40 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-black text-slate-100 text-base">{shift.code}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      isClosed
                        ? 'bg-slate-700 text-slate-300'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {shift.status}
                    </span>
                    {hasRisk && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>ASIGNACIONES EN RIESGO</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Fecha: <strong className="text-slate-200">{shift.date}</strong> | Jornada: <strong className="text-slate-200">{shift.period}</strong> | Planificado: <strong className="text-slate-200">{shift.planned_duration_hours}h</strong>
                    {isClosed && (
                      <span className="text-emerald-400 font-semibold ml-2">
                        — Cerrado con {shift.actual_duration_hours}h por {shift.closed_by}
                      </span>
                    )}
                  </p>
                  {shift.notes && (
                    <p className="text-[11px] text-slate-500 italic mt-0.5">{shift.notes}</p>
                  )}
                </div>

                {/* Acciones del Turno */}
                <div className="flex items-center space-x-2 self-start sm:self-auto">
                  {!isClosed && (
                    <>
                      <button
                        onClick={() => onOpenNewAssignment(shift)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Asignar Recurso</span>
                      </button>
                      <button
                        onClick={() => onOpenCloseShift(shift)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Cerrar Turno</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Tabla de Asignaciones del Turno */}
              <div className="p-5">
                {assignments.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    No hay asignaciones en este turno. Haz clic en "Asignar Recurso" para vincular un equipo y un operador.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                          <th className="pb-3 font-semibold">Equipo Minero</th>
                          <th className="pb-3 font-semibold">Operador Acreditado</th>
                          <th className="pb-3 font-semibold">Horómetro Actual</th>
                          <th className="pb-3 font-semibold">Estado Asignación</th>
                          <th className="pb-3 font-semibold">Autorización / Excepción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {assignments.map((asg) => {
                          const eq = asg.equipment;
                          const op = asg.operator;
                          const isRisk = asg.status === 'EN_RIESGO';

                          return (
                            <tr key={asg.id} className="hover:bg-slate-800/40 transition-colors">
                              {/* Equipo */}
                              <td className="py-3">
                                <div className="flex items-center space-x-2">
                                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                                    <Truck className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <span className="font-mono font-bold text-slate-100">{eq?.code || 'N/A'}</span>
                                    <p className="text-[10px] text-slate-400">{eq?.name} [{eq?.type}]</p>
                                  </div>
                                </div>
                              </td>

                              {/* Operador */}
                              <td className="py-3">
                                <div className="flex items-center space-x-2">
                                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-purple-400">
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-200">{op?.name || 'N/A'}</span>
                                    <p className="text-[10px] text-slate-400">{op?.code} (DNI: {op?.document_id})</p>
                                  </div>
                                </div>
                              </td>

                              {/* Horómetro */}
                              <td className="py-3 font-mono">
                                <span className="text-slate-100 font-semibold">{eq?.horometer}h</span>
                                <span className="text-[10px] text-slate-400 block">Intervalo: {eq?.maintenance_interval_hours}h</span>
                              </td>

                              {/* Estado de Asignación */}
                              <td className="py-3">
                                {isRisk ? (
                                  <div className="space-y-0.5">
                                    <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1 w-max">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>EN RIESGO</span>
                                    </span>
                                    {asg.risk_reason && (
                                      <p className="text-[10px] text-amber-400/90 leading-tight max-w-xs">
                                        {asg.risk_reason}
                                      </p>
                                    )}
                                  </div>
                                ) : asg.status === 'COMPLETADA' ? (
                                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-slate-700 text-slate-300">
                                    COMPLETADA
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    PROGRAMADA
                                  </span>
                                )}
                              </td>

                              {/* Autorización / Supervisor Override */}
                              <td className="py-3">
                                {asg.is_override ? (
                                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] space-y-0.5 max-w-xs">
                                    <div className="flex items-center space-x-1 text-red-400 font-bold">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>Excepción de Supervisor</span>
                                    </div>
                                    <p className="text-slate-300 font-medium">Por: <span className="text-amber-300">{asg.override_by}</span></p>
                                    <p className="text-[10px] text-slate-400 italic">"{asg.override_reason}"</p>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-500">Regular (Sin Excepción)</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
