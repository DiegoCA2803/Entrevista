import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Truck,
  Users,
  ChartNoAxesCombined,
  Activity,
  LogOut,
  ChevronRight,
  Bell,
  Plus,
  RefreshCw,
  Mountain,
  ArrowRight,
  ShieldCheck,
  LockKeyhole,
  Sun,
  Moon,
  Menu,
  X,
  CheckCircle2
} from 'lucide-react';
import { api, User, setApiUser, ApiError } from './services/api';
import {
  Dashboard,
  Shifts,
  Fleet,
  Operators,
  Projection,
  OperationsPage,
  PageData,
  Action
} from './pages/ControlPages';
import { ShiftPlanner } from './components/ShiftPlanner';
import { OperationForm } from './components/OperationForm';
import { ErrorBox, today } from './components/ui';

const pages = [
  {
    id: 'dashboard',
    name: 'Vista general',
    icon: LayoutDashboard,
    title: 'Panel de control',
    description: 'Toda tu operación, en una sola vista.'
  },
  {
    id: 'shifts',
    name: 'Turnos y asignaciones',
    icon: CalendarDays,
    title: 'Turnos y asignaciones',
    description: 'Organiza las jornadas y coordina los recursos de tu operación.'
  },
  {
    id: 'equipment',
    name: 'Equipos y mantenimiento',
    icon: Truck,
    title: 'Equipos y mantenimiento',
    description: 'Controla el uso, la disponibilidad y el historial de tu flota.'
  },
  {
    id: 'operators',
    name: 'Operadores',
    icon: Users,
    title: 'Operadores y certificaciones',
    description: 'Un equipo preparado empieza con operadores habilitados.'
  },
  {
    id: 'projection',
    name: 'Proyección a 7 días',
    icon: ChartNoAxesCombined,
    title: 'Proyección de mantenimiento',
    description: 'Anticípate a los próximos mantenimientos con tu planificación real.'
  },
  {
    id: 'operations',
    name: 'Trazabilidad y servicios',
    icon: Activity,
    title: 'Trazabilidad y servicios',
    description: 'Consulta la actividad, las entregas y los eventos pendientes.'
  }
];
function Brand() {
  return (
    <div className="brand">
      <span>
        <Mountain size={23} />
      </span>
      <div>
        Mine<span>Fleet</span>
        <small>CONTROL DE OPERACIONES</small>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [demoAccounts, setDemoAccounts] = useState<Awaited<ReturnType<typeof api.getDemoAccounts>>>([]);
  useEffect(() => {
    let active = true;
    api
      .getDemoAccounts()
      .then((accounts) => {
        if (active) setDemoAccounts(accounts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-content">
          <span className="eyebrow">INTELIGENCIA PARA TU OPERACIÓN</span>
          <h1>
            Cada equipo.
            <br />
            Cada turno.
            <br />
            <em>Bajo control.</em>
          </h1>
          <p>Conecta tu planificación con la realidad de la flota. Más visibilidad, mejores decisiones.</p>
          <div className="login-features">
            <span>
              <CheckCircle2 size={18} /> Asignaciones validadas
            </span>
            <span>
              <CheckCircle2 size={18} /> Mantenimiento anticipado
            </span>
            <span>
              <CheckCircle2 size={18} /> Trazabilidad de cada operación
            </span>
          </div>
        </div>
        <div className="mine-landscape" aria-hidden="true">
          <svg viewBox="0 0 700 230">
            <path d="M0 220 150 65 210 120 350 0 525 175 590 105 700 220" />
            <path d="M0 220 180 135 280 210 350 110 435 190 500 155 700 220" />
            <path d="M0 220 210 188 350 230 540 192 700 230" />
          </svg>
        </div>
        <footer>MineFleet · Gestión de flota minera</footer>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="login-lock">
            <LockKeyhole size={25} />
          </span>
          <h2>Bienvenido a MineFleet</h2>
          <p>Inicia sesión para acceder a tu operación.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                onLogin(await api.login(email, password));
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Correo electrónico
              <input
                type="email"
                autoComplete="username"
                required
                placeholder="tu.correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                required
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorBox error={error} />
            <button className="button primary" disabled={busy}>
              {busy ? 'Verificando acceso…' : 'Iniciar sesión'}
              <ArrowRight size={18} />
            </button>
          </form>
          {demoAccounts.length > 0 && (
            <aside className="login-demo" aria-label="Credenciales de demostración">
              <strong>Prueba MineFleet</strong>
              <p>Elige una cuenta de demostración para explorar la aplicación.</p>
              {demoAccounts.map((account) => (
                <div className="login-demo-account" key={account.email}>
                  <span>
                    {account.role === 'SUPERVISOR'
                      ? 'Supervisor · puede registrar operaciones'
                      : 'Consulta · solo lectura'}
                  </span>
                  <code>{account.email}</code>
                  <code>{account.password}</code>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError(undefined);
                    }}
                  >
                    Usar cuenta {account.role === 'SUPERVISOR' ? 'Supervisor' : 'Consulta'}
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </aside>
          )}
          <div className="login-security">
            <ShieldCheck size={16} /> Acceso seguro · Sesión protegida
          </div>
        </div>
        <footer>¿Necesitas acceso? Contacta al administrador de tu operación.</footer>
      </section>
    </div>
  );
}
const empty: PageData = {
  equipment: [],
  operators: [],
  shifts: [],
  projection: [],
  maintenance: [],
  audit: [],
  operations: null
};
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<unknown>();
  const [data, setData] = useState<PageData>(empty);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>();
  const [projectionWarning, setProjectionWarning] = useState('');
  const [updated, setUpdated] = useState<Date>();
  const [page, setPage] = useState(() =>
    pages.some((p) => p.id === location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard'
  );
  const [mobile, setMobile] = useState(false);
  const [planner, setPlanner] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [toast, setToast] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('minefleet:theme') === 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('minefleet:theme', dark ? 'dark' : 'light');
  }, [dark]);
  const signIn = (u: User) => {
    setApiUser(u.id);
    setUser(u);
    setAuthError(undefined);
  };
  const checkSession = useCallback(async () => {
    setChecking(true);
    setAuthError(undefined);
    try {
      signIn(await api.me());
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setAuthError(err);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void checkSession();
    const expired = () => {
      setUser(null);
      setLoaded(false);
      setData(empty);
      setPlanner(false);
      setAction(null);
    };
    window.addEventListener('minefleet:unauthorized', expired);
    return () => window.removeEventListener('minefleet:unauthorized', expired);
  }, [checkSession]);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [equipment, operators, shifts, projection, maintenance, audit, operations] = await Promise.all([
        api.getEquipment(),
        api.getOperators(),
        api.getShifts(),
        api.get7DayProjection(),
        api.getMaintenanceHistory(),
        api.getAudit(),
        api.getOperations()
      ]);
      setData({
        equipment,
        operators,
        shifts,
        projection: projection.projection,
        maintenance,
        audit,
        operations
      });
      setProjectionWarning(
        projection.isDegraded
          ? 'Proyección no disponible: se muestran solo los estados actuales. No interpretes los valores de uso futuro como una previsión válida.'
          : ''
      );
      setUpdated(new Date());
      setLoaded(true);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !planner && !action) void load();
    }, 60000);
    return () => clearInterval(timer);
  }, [user, load, planner, action]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (id: string) => {
    setPage(id);
    location.hash = id;
    setMobile(false);
  };
  useEffect(() => {
    const changed = () => {
      const id = location.hash.slice(1);
      if (pages.some((p) => p.id === id)) setPage(id);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  if (checking)
    return (
      <div className="loading-screen">
        <span className="spinner" /> Comprobando sesión…
      </div>
    );
  if (authError)
    return (
      <div className="loading-screen">
        <ErrorBox error={authError} />
        <button className="button primary" onClick={() => void checkSession()}>
          Reintentar conexión
        </button>
      </div>
    );
  if (!user) return <Login onLogin={signIn} />;
  const current = pages.find((p) => p.id === page)!;
  const canEdit = user.role === 'SUPERVISOR';
  const props = { ...data, canEdit, onAction: setAction, navigate, onPlan: () => setPlanner(true) };
  const changed = (message: string) => {
    setToast(message);
    void load();
  };
  return (
    <div className="app-shell">
      {mobile && <div className="sidebar-backdrop" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Brand />
        <button
          className="mobile-close icon-button"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-selector">
          <span className="workspace-avatar">
            <Mountain size={19} />
          </span>
          <div>
            <strong>Operación minera</strong>
            <small>Centro de control</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">OPERACIÓN</div>
        <nav>
          {pages.slice(0, 4).map((p) => (
            <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => navigate(p.id)}>
              <p.icon size={18} />
              <span>{p.name}</span>
              {p.id === 'shifts' && (
                <small>{data.shifts.filter((s) => s.status === 'PROGRAMADO').length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">ANÁLISIS Y SEGUIMIENTO</div>
        <nav>
          {pages.slice(4).map((p) => (
            <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => navigate(p.id)}>
              <p.icon size={18} />
              <span>{p.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={19} />
            <strong>Una operación más segura</strong>
            <p>Valida recursos y anticipa mantenimientos en cada jornada.</p>
          </div>
          <button className="theme-button" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />} {dark ? 'Apariencia clara' : 'Apariencia oscura'}
          </button>
          <div className="user-card">
            <span className="user-avatar">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{canEdit ? 'Supervisor' : 'Solo consulta'}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={async () => {
                try {
                  await api.logout();
                  setUser(null);
                  setLoaded(false);
                  setData(empty);
                  setApiUser('anonymous');
                } catch (err) {
                  setError(err);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              aria-label="Abrir menú"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Operación minera</span>
            <ChevronRight size={14} />
            <strong>{current.name}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${error ? 'offline' : ''}`}>
              <i />
              {error ? 'Conexión interrumpida' : loaded ? 'Datos sincronizados' : 'Conectando'}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Ver alertas y trazabilidad"
              onClick={() => navigate('operations')}
            >
              <Bell size={18} />
            </button>
            <span className="top-avatar">{user.name[0]}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">CENTRO DE OPERACIONES</span>
              <h1>{current.title}</h1>
              <p>{current.description}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary refresh"
                aria-label="Actualizar datos"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
              </button>
              {canEdit && (
                <button className="button primary" onClick={() => setPlanner(true)}>
                  <Plus size={17} /> Programar turno
                </button>
              )}
            </div>
          </div>
          <div className="page-meta">
            <span>
              <CalendarDays size={14} />
              {new Date(today() + 'T12:00:00').toLocaleDateString('es-PE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </span>
            <span>
              {updated
                ? `Última actualización ${updated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
                : 'Cargando información'}{' '}
              · Perú, UTC−5
            </span>
          </div>
          <ErrorBox error={error} />
          {projectionWarning && (
            <div role="alert" className="notice warning">
              {projectionWarning}
            </div>
          )}
          {!loaded ? (
            loading ? (
              <div className="loading-screen inner">
                <span className="spinner" /> Cargando la operación…
              </div>
            ) : (
              <div className="empty">No se pudieron cargar los datos. Usa Actualizar para reintentar.</div>
            )
          ) : (
            <>
              <div className="page-content" key={page}>
                {page === 'dashboard' && <Dashboard {...props} />}
                {page === 'shifts' && <Shifts {...props} />}
                {page === 'equipment' && <Fleet {...props} />}
                {page === 'operators' && <Operators {...props} />}
                {page === 'projection' && <Projection {...props} />}
                {page === 'operations' && (
                  <OperationsPage
                    operations={data.operations}
                    audit={data.audit}
                    canEdit={canEdit}
                    retry={async (id) => {
                      try {
                        await api.retryEvent(id);
                        changed('Evento programado para reintento.');
                      } catch (err) {
                        setError(err);
                      }
                    }}
                  />
                )}
              </div>
              <footer className="main-footer">
                <span>MineFleet · Control de flota y mantenimiento</span>
                <span>
                  <ShieldCheck size={13} /> Operaciones con trazabilidad
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {planner && (
        <ShiftPlanner
          equipment={data.equipment}
          operators={data.operators}
          shifts={data.shifts}
          onClose={() => setPlanner(false)}
          onSuccess={() => changed('Turno creado con todas sus asignaciones.')}
        />
      )}
      {action && (
        <OperationForm
          action={action}
          data={data}
          user={user}
          onClose={() => setAction(null)}
          onSuccess={changed}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button aria-label="Cerrar notificación" className="icon-button" onClick={() => setToast('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
