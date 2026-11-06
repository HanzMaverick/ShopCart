import type { ReactNode } from 'react';
import type { Pagination as PaginationInfo } from '../../api/types';
import { formatNumber } from '../../lib/format';
import { Button } from './Button';
import { EmptyState, ErrorState, Skeleton } from './feedback';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Nombre del campo que el servidor acepta en `ordenarPor`; sin esto la columna no es ordenable. */
  sortKey?: string;
  numeric?: boolean;
}
export interface SortState { by?: string | undefined; dir?: 'ASC' | 'DESC' | undefined }

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: SortState;
  onSort?: (sortKey: string) => void;
  pagination?: PaginationInfo | undefined;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

/** Tabla con ordenamiento y paginacion del lado del servidor y estados visibles de carga, vacio y error. */
export function DataTable<T>({
  columns, rows, rowKey, loading, fetching, error, onRetry, sort, onSort, pagination, onPageChange,
  emptyTitle = 'Sin resultados', emptyDescription = 'Pruebe con otros filtros.',
}: Props<T>) {
  if (error && !rows) return <div className="table-wrap"><ErrorState error={error} onRetry={onRetry} /></div>;

  return (
    <div>
      <div className="table-wrap" aria-busy={loading || fetching}>
        <table className={`table${fetching && !loading ? ' table-busy' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.numeric ? 'num' : undefined} aria-sort={c.sortKey && sort?.by === c.sortKey ? (sort.dir === 'ASC' ? 'ascending' : 'descending') : undefined}>
                  {c.sortKey && onSort ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)}>
                      {c.header}{sort?.by === c.sortKey ? (sort.dir === 'ASC' ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }, (_, i) => (
              <tr key={`sk${i}`}>{columns.map((c) => <td key={c.key}><Skeleton height={14} /></td>)}</tr>
            ))}
            {!loading && rows?.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => <td key={c.key} className={c.numeric ? 'num' : undefined}>{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows?.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
      {Boolean(error) && rows && <div className="alert alert-error" role="alert" style={{ marginTop: '.5rem' }}>No se pudo actualizar la lista. <Button size="sm" variant="ghost" onClick={onRetry}>Reintentar</Button></div>}
      {pagination && onPageChange && pagination.total > 0 && (
        <div className="pagination">
          <span>{formatNumber(pagination.total)} registros · Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)}</span>
          <div className="row">
            <Button size="sm" variant="secondary" disabled={pagination.page <= 1 || fetching} onClick={() => onPageChange(pagination.page - 1)}>Anterior</Button>
            <Button size="sm" variant="secondary" disabled={pagination.page >= pagination.totalPages || fetching} onClick={() => onPageChange(pagination.page + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Alterna ASC/DESC si se vuelve a pulsar la misma columna. */
export function nextSort(current: SortState, sortKey: string): { ordenarPor: string; direccion: 'ASC' | 'DESC' } {
  return { ordenarPor: sortKey, direccion: current.by === sortKey && current.dir === 'DESC' ? 'ASC' : 'DESC' };
}
