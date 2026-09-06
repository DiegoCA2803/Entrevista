import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ShieldAlert, CheckCircle, Truck, User } from 'lucide-react';
import { Shift, Equipment, Operator, AssignmentValidationResult } from '../types.js';
import { api } from '../services/api.js';

interface AssignmentModalProps {
  shift: Shift;
  equipmentList: Equipment[];
  operatorsList: Operator[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  shift,
  equipmentList,
  operatorsList,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [validation, setValidation] = useState<AssignmentValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Supervisor Override
  const [isOverride, setIsOverride] = useState(false);
  const [supervisorCode, setSupervisorCode] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedEquipmentId('');
      setSelectedOperatorId('');
      setValidation(null);
      setIsOverride(false);
      setSupervisorCode('');
      setOverrideReason('');
      setSubmitError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedEquipmentId || !selectedOperatorId) {
      setValidation(null);
      setIsOverride(false);
      setSubmitError(null);
      return;
    }

    let isMounted = true;
    const runValidation = async () => {
      setIsValidating(true);
      setSubmitError(null);
      try {
        const result = await api.validateAssignment(shift.id, selectedEquipmentId, selectedOperatorId);
        if (isMounted) {
          setValidation(result);
          if (result.valid) {
            setIsOverride(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setValidation({
            valid: false,
            errors: [err.message],
            warnings: [],
            can_override: false
          });
        }
      } finally {
        if (isMounted) setIsValidating(false);
      }
    };

    runValidation();
    return () => {
      isMounted = false;
    };
  }, [shift.id, selectedEquipmentId, selectedOperatorId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEquipmentId || !selectedOperatorId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await api.createAssignment(
        shift.id,
        selectedEquipmentId,
        selectedOperatorId,
        isOverride
          ? {
              is_override: true,
              override_by: supervisorCode,
              override_reason: overrideReason
            }
          : undefined
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <div>
            <h3 className="text-xl font-bold text-white">Asignar Equipo y Operador</h3>
            <p className="text-xs text-slate-400 mt-1">
              Turno <span className="text-amber-400 font-bold">{shift.code}</span> ({shift.date} - Jornada {shift.period})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Selector de Equipo */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Truck className="w-4 h-4 text-amber-400" />
              <span>1. Selecciona la Máquina / Equipo</span>
            </label>
            <select
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              required
            >
              <option value="">-- Elige una máquina de la flota --</option>
              {equipmentList.map((eq) => {
                const threshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
                const remaining = threshold - eq.horometer;
                const isBlocked = eq.status === 'BLOQUEADO';
                return (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} — {eq.name} ({eq.horometer}h de uso) {isBlocked ? '[BLOQUEADO]' : `[Restan ${remaining > 0 ? remaining.toFixed(0) : 0}h]`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selector de Operador */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <User className="w-4 h-4 text-purple-400" />
              <span>2. Selecciona el Operador</span>
            </label>
            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              required
            >
              <option value="">-- Elige un operador disponible --</option>
              {operatorsList.map((op) => {
                const certTypes = (op.certifications || []).map(c => c.equipment_type.replace('_', ' ')).join(', ');
                return (
                  <option key={op.id} value={op.id}>
                    {op.name} ({op.code}) {certTypes ? `[Certificado en: ${certTypes}]` : '[Sin licencias cargadas]'}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Validando */}
          {isValidating && (
            <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-amber-300 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Comprobando disponibilidad, horómetros y licencias...</span>
            </div>
          )}

          {/* REGLA 11: ERRORES DE VALIDACIÓN VISIBLES CLARAMENTE */}
          {validation && !validation.valid && (
            <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs space-y-3 animate-fade-in">
              <div className="flex items-center space-x-2 font-bold text-red-400 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>No se puede asignar por los siguientes motivos:</span>
              </div>
              <ul className="space-y-2 pl-1">
                {validation.errors.map((err, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-slate-200 leading-relaxed">
                    <span className="text-red-400 font-bold">•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>

              {/* Opción de Supervisor Override */}
              {validation.can_override && (
                <div className="mt-4 pt-4 border-t border-red-500/20">
                  <label className="flex items-center space-x-3 cursor-pointer text-slate-200 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isOverride}
                      onChange={(e) => setIsOverride(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="font-bold text-amber-400 flex items-center space-x-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Autorizar excepción como Supervisor de Guardia</span>
                    </span>
                  </label>

                  {isOverride && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-900 border border-amber-500/30 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-300 mb-1">
                          Nombre o Código del Supervisor *
                        </label>
                        <input
                          type="text"
                          value={supervisorCode}
                          onChange={(e) => setSupervisorCode(e.target.value)}
                          placeholder="Ej. SUP-GUARDIA-NORTE"
                          required={isOverride}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-300 mb-1">
                          Motivo / Justificación obligatoria *
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Indica el motivo de la excepción de seguridad..."
                          rows={2}
                          required={isOverride}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Estado Válido */}
          {validation && validation.valid && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm">Asignación Habilitada</p>
                <p className="text-slate-300 mt-0.5">La máquina está disponible y el operador cuenta con certificación vigente.</p>
              </div>
            </div>
          )}

          {submitError && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs">
              {submitError}
            </div>
          )}

          {/* Botones */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                !selectedEquipmentId ||
                !selectedOperatorId ||
                isValidating ||
                isSubmitting ||
                (validation ? !validation.valid && !isOverride : true) ||
                (isOverride && (!supervisorCode || overrideReason.length < 10))
              }
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 disabled:opacity-40"
            >
              {isSubmitting ? 'Guardando...' : isOverride ? 'Confirmar Asignación con Excepción' : 'Confirmar Asignación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
