import React, { useState } from 'react';
import { Users, Plus, ShieldCheck, AlertCircle, Award, CheckCircle } from 'lucide-react';
import { Operator, EquipmentType } from '../types.js';
import { api } from '../services/api.js';

interface OperatorsPageProps {
  operators: Operator[];
  onRefresh: () => void;
}

export const OperatorsPage: React.FC<OperatorsPageProps> = ({ operators, onRefresh }) => {
  const [selectedOpForCert, setSelectedOpForCert] = useState<Operator | null>(null);
  const [certType, setCertType] = useState<EquipmentType>('CAMION_ACARREO');
  const [issuedDate, setIssuedDate] = useState('2025-01-01');
  const [expirationDate, setExpirationDate] = useState('2027-01-01');
  const [institution, setInstitution] = useState('Centro de Certificación Minera');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const handleAddCert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpForCert) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/operators/${selectedOpForCert.id}/certifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipment_type: certType,
          issued_date: issuedDate,
          expiration_date: expirationDate,
          institution
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar certificación');

      setSelectedOpForCert(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center space-x-2">
          <Users className="w-6 h-6 text-amber-400" />
          <span>Operadores y Acreditaciones Técnicas</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Control de vigencia de licencias y certificaciones por tipología de equipo minero.
        </p>
      </div>

      {/* Lista de Operadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {operators.map((op) => {
          const certs = op.certifications || [];
          const hasExpired = certs.some(c => c.expiration_date < today);

          return (
            <div
              key={op.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-amber-400 text-sm">{op.code}</span>
                      <h3 className="font-bold text-slate-100 text-base">{op.name}</h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">DNI / Documento: {op.document_id}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    hasExpired ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {hasExpired ? 'Cert. Vencida' : 'Acreditado'}
                  </span>
                </div>

                {/* Certificaciones */}
                <div className="mt-4 space-y-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Certificaciones Registradas ({certs.length}):
                  </span>

                  {certs.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No tiene certificaciones registradas.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {certs.map((c) => {
                        const isExpired = c.expiration_date < today;
                        return (
                          <div
                            key={c.id}
                            className={`p-2.5 rounded-xl border ${
                              isExpired
                                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                            } flex items-center justify-between text-xs`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <Award className={`w-3.5 h-3.5 ${isExpired ? 'text-red-400' : 'text-amber-400'}`} />
                                <span className="font-bold">{c.equipment_type.replace('_', ' ')}</span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {c.institution || 'Entidad Minera'} | Vence: <strong className={isExpired ? 'text-red-400 font-mono' : 'text-slate-200 font-mono'}>{c.expiration_date}</strong>
                              </p>
                            </div>

                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              isExpired ? 'bg-red-500/30 text-red-200' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {isExpired ? 'VENCIDA' : 'VIGENTE'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Botón Añadir Certificación */}
              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={() => setSelectedOpForCert(op)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir Certificación Técnica</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Añadir Certificación */}
      {selectedOpForCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100">
              Nueva Certificación para {selectedOpForCert.name}
            </h3>
            <form onSubmit={handleAddCert} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Equipo</label>
                <select
                  value={certType}
                  onChange={(e) => setCertType(e.target.value as any)}
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
                  <label className="block text-slate-300 font-semibold mb-1">Fecha Emisión</label>
                  <input
                    type="date"
                    required
                    value={issuedDate}
                    onChange={(e) => setIssuedDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Fecha Vencimiento</label>
                  <input
                    type="date"
                    required
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Institución Emisora</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30">
                  {error}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedOpForCert(null)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Certificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
