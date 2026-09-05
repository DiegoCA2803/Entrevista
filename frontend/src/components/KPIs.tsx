import React from 'react';
import { Truck, AlertOctagon, CheckCircle2, Wrench, Users, Calendar } from 'lucide-react';
import { Equipment, Operator, Shift, ProjectionItem } from '../types.js';

interface KPIsProps {
  equipment: Equipment[];
  operators: Operator[];
  shifts: Shift[];
  projection: ProjectionItem[];
}

export const KPIs: React.FC<KPIsProps> = ({ equipment, operators, shifts, projection }) => {
  const totalEquipment = equipment.length;
  const availableEquipment = equipment.filter(e => e.status === 'DISPONIBLE').length;
  const blockedEquipment = equipment.filter(e => e.status === 'BLOQUEADO').length;
  const maintenanceEquipment = equipment.filter(e => e.status === 'EN_MANTENIMIENTO').length;

  const totalOperators = operators.length;
  const operatorsWithExpiredCerts = operators.filter(op => {
    const certs = op.certifications || [];
    const today = new Date().toISOString().split('T')[0];
    return certs.some(c => c.expiration_date < today);
  }).length;

  const criticalProjectionCount = projection.filter(p => p.will_reach_maintenance).length;

  const cards = [
    {
      title: 'Flota de Equipos',
      value: totalEquipment,
      subtitle: `${availableEquipment} listos para operar`,
      icon: Truck,
      color: 'text-blue-400',
      badge: 'Operativa',
      badgeColor: 'bg-blue-500/20 text-blue-300'
    },
    {
      title: 'Equipos Bloqueados',
      value: blockedEquipment,
      subtitle: blockedEquipment > 0 ? 'Superaron límite de 250h' : 'Ningún equipo bloqueado',
      icon: AlertOctagon,
      color: 'text-red-400',
      badge: blockedEquipment > 0 ? 'Requiere Mantenimiento' : 'Al Día',
      badgeColor: blockedEquipment > 0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
    },
    {
      title: 'En Taller',
      value: maintenanceEquipment,
      subtitle: 'En revisión mecánica',
      icon: Wrench,
      color: 'text-amber-400',
      badge: 'Taller Activo',
      badgeColor: 'bg-amber-500/20 text-amber-300'
    },
    {
      title: 'Operadores',
      value: totalOperators,
      subtitle: `${operatorsWithExpiredCerts} con licencia vencida`,
      icon: Users,
      color: 'text-purple-400',
      badge: operatorsWithExpiredCerts > 0 ? 'Revisar Licencias' : 'Todos Acreditados',
      badgeColor: operatorsWithExpiredCerts > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
    },
    {
      title: 'Alerta a 7 Días',
      value: criticalProjectionCount,
      subtitle: 'Llegarán a 250h esta semana',
      icon: Calendar,
      color: 'text-amber-400',
      badge: 'Proyección Futura',
      badgeColor: 'bg-amber-500/20 text-amber-300'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg relative overflow-hidden transition-all hover:border-slate-700"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{card.title}</span>
              <div className="p-2 rounded-xl bg-slate-800 text-amber-400">
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-white">{card.value}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-400">{card.subtitle}</p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold inline-block ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
