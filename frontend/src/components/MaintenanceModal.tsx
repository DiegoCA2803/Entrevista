import React, { useState } from 'react';
import { X, Wrench, CheckCircle, Info } from 'lucide-react';
import { Equipment } from '../types.js';
import { api } from '../services/api.js';

interface MaintenanceModalProps {
  equipment: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  equipment,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [performedBy, setPerformedBy] = useState('Ing. Jefe de Taller Mecánico');
  const [horometerAtPm, setHorometerAtPm] = useState<number>(equipment?.horometer || 0);
  const [maintenanceType, setMaintenanceType] = useState<'PREVENTIVO' | 'CORRECTIVO'>('PREVENTIVO');
  const [notes, setNotes] = useState('Mantenimiento preventivo periódico completado. Reemplazo de fluidos y filtros.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update default horometer when equipment changes
  React.useEffect(() => {
    if (equipment) {
      setHorometerAtPm(equipment.horometer);
    }
  }, [equipment]);

  if (!isOpen || !equipment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.registerMaintenance({
        equipment_id: equipment.id,
        performed_by: performedBy,
        horometer_at_maintenance: Number(horometerAtPm),
        maintenance_type: maintenanceType,
        notes: notes
      });

      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextThreshold = Number(horometerAtPm) + equipment.maintenance_interval_hours;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              <span>Registrar Mantenimiento de Equipo</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Equipo <span className="text-amber-400 font-semibold">{equipment.code}</span> — {equipment.name}
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
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs flex items-start space-x-2.5">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-300">Liberación y Reinicio de Ciclo de Mantenimiento</p>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Al registrar este mantenimiento, el equipo quedará liberado a estado <strong className="text-emerald-400">DISPONIBLE</strong>.
                El nuevo ciclo se contabilizará desde el <strong className="text-blue-300">horómetro real de servicio ({horometerAtPm}h)</strong>, situando el siguiente mantenimiento a las <strong className="text-amber-400">{nextThreshold}h</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Horómetro Real en Mantenimiento *
              </label>
              <input
                type="number"
                step="0.1"
                min={equipment.last_maintenance_horometer}
                value={horometerAtPm}
                onChange={(e) => setHorometerAtPm(Number(e.target.value))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Tipo de Mantenimiento
              </label>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-amber-500"
              >
                <option value="PREVENTIVO">Preventivo (PM-250h)</option>
                <option value="CORRECTIVO">Correctivo / Reparación</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Responsable Técnico del Mantenimiento *
            </label>
            <input
              type="text"
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Detalle y Observaciones de Servicio *
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-100 focus:ring-2 focus:ring-amber-500"
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
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40"
            >
              {isSubmitting ? 'Registrando y Liberando...' : 'Registrar Mantenimiento y Liberar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
