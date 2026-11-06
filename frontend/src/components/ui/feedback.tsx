import type { ReactNode } from 'react';
import { errorMessage } from '../../lib/errors';
import { Button } from './Button';

export function Spinner({ large }: { large?: boolean }) {
  return <span className={`spinner${large ? ' spinner-lg' : ''}`} role="status" aria-label="Cargando" />;
}

export function FullPageSpinner({ label = 'Cargando...' }: { label?: string }) {
  return <div className="center" role="status"><Spinner large /><span className="muted">{label}</span></div>;
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/** Estado de error con reintento (se usa en todas las vistas que cargan datos). */
export function ErrorState({ error, onRetry, title = 'No se pudo cargar la informacion' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="center" role="alert">
      <strong>{title}</strong>
      <span className="muted">{errorMessage(error)}</span>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="center">
      <strong>{title}</strong>
      {description && <span className="muted">{description}</span>}
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`}>{children}</span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
