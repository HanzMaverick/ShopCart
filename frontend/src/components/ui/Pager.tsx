import type { Pagination } from '../../api/types';
import { formatNumber } from '../../lib/format';
import { Button } from './Button';

export function Pager({ pagination, onPageChange, fetching }: { pagination: Pagination | undefined; onPageChange: (p: number) => void; fetching?: boolean }) {
  if (!pagination || pagination.total === 0) return null;
  return (
    <div className="pagination">
      <span>{formatNumber(pagination.total)} resultados · Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)}</span>
      <div className="row">
        <Button size="sm" variant="secondary" disabled={pagination.page <= 1 || fetching} onClick={() => onPageChange(pagination.page - 1)}>Anterior</Button>
        <Button size="sm" variant="secondary" disabled={pagination.page >= pagination.totalPages || fetching} onClick={() => onPageChange(pagination.page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
