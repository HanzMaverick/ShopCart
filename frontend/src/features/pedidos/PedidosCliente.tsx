import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { pedidosApi, type FiltrosPedidos } from '../../api/endpoints';
import type { PedidoResumen } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, nextSort, type Column } from '../../components/ui/DataTable';
import { SelectField, TextField } from '../../components/ui/fields';
import { Alert, Card, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useUrlState } from '../../hooks/useUrlState';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatQ } from '../../lib/format';
import { ESTADOS, ESTADO_LABEL, puedeCancelar } from './estados';
import { EstadoBadge, PedidoView } from './PedidoView';

/** Filtros de pedidos en URL (compartido por la vista del cliente y la del panel interno). */
export function usePedidosFiltros(pageSize = 10) {
  const url = useUrlState();
  const sort = { by: url.get('ordenarPor') ?? 'Fecha', dir: (url.get('direccion') === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC' };
  const filtros: FiltrosPedidos = {
    idEstadoPedido: url.getNum('estado'), cliente: url.get('cliente'), desde: url.get('desde'), hasta: url.get('hasta'),
    ordenarPor: sort.by, direccion: sort.dir, page: url.page, pageSize,
  };
  return { url, sort, filtros };
}

export function columnasPedidos(basePath: string, mostrarCliente: boolean): Column<PedidoResumen>[] {
  return [
    { key: 'num', header: 'Pedido', cell: (p) => <Link to={`${basePath}/${p.idPedido}`}><strong>{p.numeroPedido}</strong></Link> },
    { key: 'fecha', header: 'Fecha', sortKey: 'Fecha', cell: (p) => formatDateTime(p.fechaCreacion) },
    ...(mostrarCliente ? [{ key: 'cliente', header: 'Cliente', sortKey: 'Cliente', cell: (p: PedidoResumen) => <>{p.nombreCliente}<br /><span className="muted small">{p.correoCliente}</span></> }] : []),
    { key: 'estado', header: 'Estado', sortKey: 'Estado', cell: (p) => <EstadoBadge estado={p.estado} /> },
    { key: 'total', header: 'Total', sortKey: 'Total', numeric: true, cell: (p) => formatQ(p.total) },
    { key: 'acc', header: '', cell: (p) => <Link className="btn btn-secondary btn-sm" to={`${basePath}/${p.idPedido}`}>Ver</Link> },
  ];
}

export function FiltrosPedidosBar({ url, conCliente }: { url: ReturnType<typeof useUrlState>; conCliente?: boolean }) {
  const [cliente, setCliente] = useState(url.get('cliente') ?? '');
  return (
    <Card className="card-flat">
      <div className="filters">
        <SelectField label="Estado" value={url.get('estado') ?? ''} onChange={(e) => url.set({ estado: e.target.value })}>
          <option value="">Todos</option>
          {ESTADOS.map((s) => <option key={s.id} value={s.id}>{ESTADO_LABEL[s.nombre]}</option>)}
        </SelectField>
        {conCliente && (
          <TextField label="Cliente" placeholder="Nombre o correo" value={cliente} onChange={(e) => setCliente(e.target.value)}
                     onBlur={() => url.set({ cliente })} onKeyDown={(e) => { if (e.key === 'Enter') url.set({ cliente }); }} />
        )}
        <TextField label="Desde" type="date" value={url.get('desde') ?? ''} onChange={(e) => url.set({ desde: e.target.value })} />
        <TextField label="Hasta (inclusive)" type="date" value={url.get('hastaVisible') ?? ''}
                   onChange={(e) => {
                     const v = e.target.value;   // el API usa "hasta" exclusivo: se envia el dia siguiente
                     const next = v ? new Date(new Date(`${v}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10) : '';
                     url.set({ hastaVisible: v, hasta: next });
                   }} />
        <Button variant="ghost" size="sm" onClick={() => { setCliente(''); url.set({ estado: null, cliente: null, desde: null, hasta: null, hastaVisible: null }); }}>Limpiar</Button>
      </div>
    </Card>
  );
}

export function MisPedidosPage() {
  const { url, sort, filtros } = usePedidosFiltros();
  const q = useQuery({ queryKey: ['pedidos', 'mis', filtros], queryFn: () => pedidosApi.mis(filtros), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Mis pedidos" subtitle="Historial y seguimiento de sus compras" />
      <div className="stack">
        <FiltrosPedidosBar url={url} />
        <DataTable columns={columnasPedidos('/pedidos', false)} rows={q.data?.data} rowKey={(p) => p.idPedido} loading={q.isPending} fetching={q.isFetching}
                   error={q.error} onRetry={() => void q.refetch()} sort={sort} onSort={(k) => { const n = nextSort(sort, k); url.set(n); }}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="Aun no tiene pedidos" emptyDescription="Cuando compre, aparecera aqui." />
      </div>
    </>
  );
}

export function PedidoClientePage() {
  const { id } = useParams();
  const idNum = Number(id);
  const location = useLocation() as { state?: { nuevo?: boolean; repetida?: boolean } };
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['pedidos', 'detalle', idNum], queryFn: () => pedidosApi.detalle(idNum), enabled: Number.isInteger(idNum) && idNum > 0 });
  const cancelar = useMutation({
    mutationFn: () => pedidosApi.cancelar(idNum),
    onSuccess: async () => { toast.success('Pedido cancelado. El reembolso quedo registrado.'); setConfirm(false); await qc.invalidateQueries({ queryKey: ['pedidos'] }); },
    onError: (e) => { toast.error(errorMessage(e)); setConfirm(false); },
  });

  if (q.isPending) return <div className="stack"><Skeleton height={100} /><Skeleton height={220} /></div>;
  if (q.isError) return <ErrorState title="No se encontro el pedido" error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="stack">
      <Link to="/pedidos" className="small">← Mis pedidos</Link>
      {location.state?.nuevo && <Alert tone="success">{location.state.repetida ? 'Este pedido ya estaba registrado (solicitud repetida): no se genero un segundo cobro.' : '¡Gracias por su compra! Su pago fue aprobado.'}</Alert>}
      <PedidoView detalle={q.data}>
        {puedeCancelar(q.data.pedido.idEstadoPedido) && (
          <Card><div className="row-between"><span className="muted">Puede cancelar este pedido mientras no sea despachado.</span><Button variant="danger" onClick={() => setConfirm(true)}>Cancelar pedido</Button></div></Card>
        )}
      </PedidoView>
      {confirm && <ConfirmDialog title="Cancelar pedido" danger confirmLabel="Si, cancelar" loading={cancelar.isPending} message="Se reintegrara la existencia y se registrara el reembolso. Esta accion no se puede deshacer." onConfirm={() => cancelar.mutate()} onCancel={() => setConfirm(false)} />}
    </div>
  );
}
