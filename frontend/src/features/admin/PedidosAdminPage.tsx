import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { pedidosApi } from '../../api/endpoints';
import { DataTable, nextSort } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/feedback';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { columnasPedidos, FiltrosPedidosBar, usePedidosFiltros } from '../pedidos/PedidosCliente';

export default function PedidosAdminPage() {
  const { url, sort, filtros } = usePedidosFiltros(15);
  const q = useQuery({ queryKey: ['pedidos', 'admin', filtros], queryFn: () => pedidosApi.todos(filtros), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Pedidos" subtitle="Gestion de pedidos de todos los clientes" actions={<LiveBadge />} />
      <div className="stack">
        <FiltrosPedidosBar url={url} conCliente />
        <DataTable columns={columnasPedidos('/admin/pedidos', true)} rows={q.data?.data} rowKey={(p) => p.idPedido} loading={q.isPending} fetching={q.isFetching}
                   error={q.error} onRetry={() => void q.refetch()} sort={sort} onSort={(k) => url.set(nextSort(sort, k))}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="No hay pedidos con esos filtros" />
      </div>
    </>
  );
}
