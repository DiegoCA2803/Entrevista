import { useEffect, useRef, type ReactNode } from 'react';
import { X, AlertCircle, Search } from 'lucide-react';
import { ApiError } from '../services/api';
export const labels: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  BLOQUEADO: 'Bloqueado',
  EN_MANTENIMIENTO: 'En mantenimiento',
  PROGRAMADO: 'Programado',
  EN_CURSO: 'En curso',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
  PROGRAMADA: 'Programada',
  EN_RIESGO: 'En riesgo',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  CAMION_ACARREO: 'Camión de acarreo',
  EXCAVADORA: 'Excavadora',
  PERFORADORA: 'Perforadora',
  CARGADOR_FRONTAL: 'Cargador frontal',
  TRACTOR_ORUGA: 'Tractor de oruga',
  PENDING: 'Pendiente',
  PROCESSING: 'Enviando',
  DELIVERED: 'Entregado',
  DEAD: 'Requiere atención'
};
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
export const dateLabel = (date: string) =>
  new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
export const num = (n: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(n);
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${['BLOQUEADO', 'DEAD'].includes(status) ? 'red' : ['EN_RIESGO', 'EN_MANTENIMIENTO', 'PENDING'].includes(status) ? 'amber' : ['DISPONIBLE', 'DELIVERED', 'PROGRAMADA'].includes(status) ? 'green' : 'neutral'}`}
    >
      <i />
      {labels[status] || status}
    </span>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>{error instanceof Error ? error.message : String(error)}</strong>
        {error instanceof ApiError && error.violations.length > 0 && (
          <ul>
            {error.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…'
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  busy = false
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal ${wide ? 'wide' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
          if (e.key === 'Tab') {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar ventana"
            disabled={busy}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
