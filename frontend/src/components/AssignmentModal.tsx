import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ShieldAlert, CheckCircle, ShieldCheck, HelpCircle } from 'lucide-react';
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

  // Supervisor Override State
  const [isOverride, setIsOverride] = useState(false);
  const [supervisorCode, setSupervisorCode] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form when modal opens/closes
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

  // Pre-validar automáticamente cuando se selecciona tanto equipo como operador (Regla 11)
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

  const selectedEquipment = equipmentList.find(e => e.id === selectedEquipmentId);
  const selectedOperator = operatorsList.find(o => o.id === selectedOperatorId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>Nueva Asignación de Turno</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Turno <span className="text-amber-400 font-semibold">{shift.code}</span> — Fecha: {shift.date} ({shift.period})
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Selección de Equipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              1. Seleccionar Equipo Minero
            </label>
            <select
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              required
            >
              <option value="">-- Elige un equipo de la flota --</option>
              {equipmentList.map((eq) => {
                const threshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
                const remaining = threshold - eq.horometer;
                return (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} - {eq.name} [{eq.type}] | {eq.horometer}h (Resta: {remaining > 0 ? remaining.toFixed(1) : 0}h) {eq.status !== 'DISPONIBLE' ? `[${eq.status}]` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selección de Operador */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              2. Seleccionar Operador
            </label>
            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              required
            >
              <option value="">-- Elige un operador disponible --</option>
              {operatorsList.map((op) => {
                const certTypes = (op.certifications || []).map(c => c.equipment_type).join(', ');
                return (
                  <option key={op.id} value={op.id}>
                    {op.code} - {op.name} (DNI: {op.document_id}) {certTypes ? `[Cert: ${certTypes}]` : '[Sin Cert]'}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Estado de Validación en Tiempo Real */}
          {isValidating && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Verificando reglas de negocio mineras...</span>
            </div>
          )}

          {/* REGLA 11: MOSTRAR TODAS LAS CAUSAS DE RECHAZO */}
          {validation && !validation.valid && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs space-y-2 animate-fade-in">
              <div className="flex items-center space-x-2 font-bold text-red-400 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>Asignación Rechazada ({validation.errors.length} causas detectadas):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
                {validation.errors.map((err, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {err}
                  </li>
                ))}
              </ul>

              {/* Advertencias adicionales */}
              {validation.warnings.length > 0 && (
                <div className="mt-3 pt-2 border-t border-red-500/20 text-amber-300 space-y-1">
                  {validation.warnings.map((w, idx) => (
                    <p key={idx}>⚠️ {w}</p>
                  ))}
                </div>
              )}

              {/* DECISIÓN 2: Forzar asignación con autorización de supervisor */}
              {validation.can_override && (
                <div className="mt-4 pt-3 border-t border-red-500/20">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isOverride}
                      onChange={(e) => setIsOverride(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-amber-400 flex items-center space-x-1">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Solicitar Excepción con Autorización de Supervisor</span>
                    </span>
                  </label>

                  {isOverride && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
                      <div>
                        <label className="block text-[11px] font-medium text-amber-300 mb-1">
                          Código/Usuario de Supervisor Autorizante *
                        </label>
                        <input
                          type="text"
                          value={supervisorCode}
                          onChange={(e) => setSupervisorCode(e.target.value)}
                          placeholder="Ej. SUP_TURNO_NORTE_01"
                          required={isOverride}
                          className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-amber-300 mb-1">
                          Justificación Obligatoria de la Excepción (&gt;10 caracteres) *
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Ej. Autorizado por Jefatura por emergencia en frente de acarreo..."
                          rows={2}
                          required={isOverride}
                          className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <p className="text-[10px] text-amber-400/80">
                        * Esta asignación forzada quedará marcada permanentemente en la auditoría del sistema con su justificación.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Estado Válido */}
          {validation && validation.valid && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-semibold">Cumple al 100% las reglas de negocio mineras.</p>
                <p className="text-[11px] text-emerald-400/80">Equipo operativo y operador con certificación acreditada para este turno.</p>
              </div>
            </div>
          )}

          {/* Error de Envío */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs">
              {submitError}
            </div>
          )}

          {/* Botones de Acción */}
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
              disabled={
                !selectedEquipmentId ||
                !selectedOperatorId ||
                isValidating ||
                isSubmitting ||
                (validation ? !validation.valid && !isOverride : true) ||
                (isOverride && (!supervisorCode || overrideReason.length < 10))
              }
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Guardando Asignación...' : isOverride ? 'Confirmar Asignación Forzada' : 'Confirmar Asignación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
