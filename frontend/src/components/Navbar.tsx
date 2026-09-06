import React from 'react';
import { 
  Truck, 
  Users, 
  Calendar, 
  TrendingUp, 
  LayoutDashboard,
  Sun,
  Moon
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onDataReset?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  theme, 
  onToggleTheme 
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard },
    { id: 'shifts', label: 'Turnos y Asignaciones', icon: Calendar },
    { id: 'equipment', label: 'Equipos y Mantenimiento', icon: Truck },
    { id: 'operators', label: 'Operadores y Licencias', icon: Users },
    { id: 'projection', label: 'Proyección 7 Días', icon: TrendingUp, highlight: true },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Marca */}
          <div 
            className="flex items-center space-x-3 cursor-pointer select-none" 
            onClick={() => setCurrentTab('dashboard')}
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">MINE<span className="text-amber-400">FLEET</span></span>
                <span className="text-[11px] uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">Control Minero</span>
              </div>
              <p className="text-xs text-slate-400">Gestión de Flota, Turnos y Mantenimiento</p>
            </div>
          </div>

          {/* Navegación y Botón Pantalla Blanca / Oscura */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Navegación Principal */}
            <nav className="hidden md:flex items-center space-x-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.highlight && !isActive && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Botón selector de pantalla blanca */}
            <button
              onClick={onToggleTheme}
              title={theme === 'light' ? 'Cambiar a pantalla oscura' : 'Cambiar a pantalla blanca'}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
              }`}
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-4 h-4 text-slate-700" />
                  <span className="hidden sm:inline">Pantalla Oscura</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Pantalla Blanca</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden overflow-x-auto py-2.5 space-x-1.5 border-t border-slate-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
