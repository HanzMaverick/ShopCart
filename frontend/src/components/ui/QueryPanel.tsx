import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Skeleton } from './feedback';

interface Props<T> { title: string; subtitle?: string; query: UseQueryResult<T>; isEmpty?: (data: T) => boolean; emptyText?: string; children: (data: T) => ReactNode }

/** Tarjeta que resuelve por si sola los estados de carga, error (con reintento) y vacio de una consulta. */
export function QueryPanel<T>({ title, subtitle, query, isEmpty, emptyText = 'Sin datos para el periodo seleccionado.', children }: Props<T>) {
  return (
    <Card>
      <h2 style={{ marginBottom: subtitle ? 0 : undefined }}>{title}</h2>
      {subtitle && <p className="muted small">{subtitle}</p>}
      {query.isPending && <div className="stack-sm"><Skeleton height={18} /><Skeleton height={18} width="80%" /><Skeleton height={120} /></div>}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data !== undefined && (isEmpty?.(query.data) ? <EmptyState title={emptyText} /> : <div style={query.isFetching ? { opacity: 0.6 } : undefined}>{children(query.data)}</div>)}
    </Card>
  );
}
