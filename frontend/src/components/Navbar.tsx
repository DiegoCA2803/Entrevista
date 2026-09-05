import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Users, 
  Calendar, 
  TrendingUp, 
  Wrench, 
  RotateCcw, 
  Activity, 
  ShieldCheck, 
  AlertTriangle,
  LayoutDashboard
} from 'lucide-react';
import { api } from '../services/api.js';
import { HealthResponse } from '../types.js';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onDataReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, onDataReset }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch {
      // Ignorar si aún está arrancando
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleResetDemo = async () => {
    if (!window.confirm('¿Deseas restablecer los datos a los casos de prueba iniciales (equipo a punto de PM, operador vencido, turno crítico)?')) {
      return;
    }
    setResetting(true);
    try {
      const res = await api.resetDemoData();
      setResetMsg('¡Datos de prueba restablecidos!');
      setTimeout(() => setResetMsg(null), 4000);
      onDataReset();
      await fetchHealth();
    } catch (err: any) {
      alert(`Error al restablecer: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Panel General', icon: LayoutDashboard },
    { id: 'shifts', label: 'Turnos & Asignaciones', icon: Calendar },
    { id: 'equipment', label: 'Equipos & Mantenimiento', icon: Truck },
    { id: 'operators', label: 'Operadores & Cert.', icon: Users },
    { id: 'projection', label: 'Proyección 7 Días', icon: TrendingUp, highlight: true },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Marca */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-wider text-slate-100">MINE<span className="text-amber-400">FLEET</span></span>
                <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">Minera</span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">Control de Asignaciones, Horómetros & SOA</p>
            </div>
          </div>

          {/* Navegación Principal */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.highlight && (
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-slate-950' : 'bg-amber-400 animate-pulse'}`} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Acciones y Estado SOA */}
          <div className="flex items-center space-x-3">
            {/* Indicador de Resiliencia SOA */}
            <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>SOA:</span>
              <span className="font-semibold text-emerald-400">Activo</span>
            </div>

            {/* Botón de Reset para Evaluador */}
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              title="Restablecer base de datos con los casos de prueba solicitados"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors shadow-sm disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Reset Datos Demo</span>
            </button>
          </div>
        </div>

        {/* Notificación de reset */}
        {resetMsg && (
          <div className="py-1 px-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded mb-2 text-center animate-fade-in">
            {resetMsg}
          </div>
        )}

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden overflow-x-auto py-2 space-x-1 border-t border-slate-800/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
