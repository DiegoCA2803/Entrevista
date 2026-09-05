import React, { useState } from 'react';
import { X, CheckCircle2, AlertOctagon, Clock, Info } from 'lucide-react';
import { Shift } from '../types.js';
import { api } from '../services/api.js';

interface CloseShiftModalProps {
  shift: Shift;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  shift,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [actualHours, setActualHours] = useState(shift.planned_duration_hours || 8);
  const [closedBy, setClosedBy] = useState('Jefe de Guardia Minera');
  const [notes, setNotes] = useState('Turno concluido de forma regular.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const assignmentsCount = shift.assignments?.length || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.closeShift(shift.id, Number(actualHours), closedBy, notes);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Cierre Operativo de Turno</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Turno <span className="text-amber-400 font-semibold">{shift.code}</span> — Fecha: {shift.date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start space-x-2.5">
            <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">Actualización de Horómetros al Cierre</p>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Al cerrar el turno, las <strong className="text-amber-300">horas efectivamente trabajadas</strong> se sumarán al horómetro de los {assignmentsCount} equipo(s) asignados.
                Si algún equipo alcanza su intervalo de mantenimiento, quedará <strong className="text-red-400">BLOQUEADO</strong> automáticamente.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Horas Efectivamente Trabajadas *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={actualHours}
                onChange={(e) => setActualHours(Number(e.target.value))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 pr-12 font-mono font-semibold text-base"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">horas</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Planificado: {shift.planned_duration_hours}h (ajusta las horas si hubo horas extra o paradas no programadas).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Responsable de Cierre (Jefe de Guardia / Despachador) *
            </label>
            <input
              type="text"
              value={closedBy}
              onChange={(e) => setClosedBy(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Observaciones del Turno
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || actualHours < 0}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-40"
            >
              {isSubmitting ? 'Cerrando y Actualizando Horómetros...' : 'Cerrar Turno y Actualizar Flota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
