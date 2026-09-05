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
      title: 'Flota Total',
      value: totalEquipment,
      subtitle: `${availableEquipment} disponibles`,
      icon: Truck,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      badge: 'Operativa'
    },
    {
      title: 'Bloqueados por PM',
      value: blockedEquipment,
      subtitle: 'Requieren mantenimiento',
      icon: AlertOctagon,
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      badge: blockedEquipment > 0 ? 'Atención Inmediata' : 'Normal',
      badgeColor: blockedEquipment > 0 ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-300'
    },
    {
      title: 'En Taller / Mantenimiento',
      value: maintenanceEquipment,
      subtitle: 'En servicio activo',
      icon: Wrench,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      badge: 'Taller'
    },
    {
      title: 'Operadores',
      value: totalOperators,
      subtitle: `${operatorsWithExpiredCerts} con cert. vencida`,
      icon: Users,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      badge: operatorsWithExpiredCerts > 0 ? 'Cert. Vencidas' : 'Al Día',
      badgeColor: operatorsWithExpiredCerts > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
    },
    {
      title: 'Alcanzarán PM (7 días)',
      value: criticalProjectionCount,
      subtitle: 'Según turnos programados',
      icon: Calendar,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20',
      badge: 'Proyección Futura',
      badgeColor: 'bg-amber-500/20 text-amber-300 font-semibold'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`p-4 rounded-xl border ${card.bg} backdrop-blur-sm relative overflow-hidden transition-all hover:scale-[1.01]`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{card.title}</span>
              <Icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-slate-100">{card.value}</span>
              {card.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${card.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {card.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">{card.subtitle}</p>
          </div>
        );
      })}
    </div>
  );
};
