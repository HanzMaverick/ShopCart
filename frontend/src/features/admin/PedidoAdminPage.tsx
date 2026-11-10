import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pedidosApi } from '../../api/endpoints';
import type { PedidoDetalle } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { TextareaField } from '../../components/ui/fields';
import { Alert, Card, ErrorState, Skeleton } from '../../components/ui/feedback';
import { errorMessage } from '../../lib/errors';
import { formatQ } from '../../lib/format';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { ESTADO_LABEL, puedeDevolver } from '../pedidos/estados';
import { PedidoView } from '../pedidos/PedidoView';

function CambiarEstadoModal({ pedidoId, destino, onClose }: { pedidoId: number; destino: { id: number; nombre: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [comentario, setComentario] = useState('');
  const m = useMutation({
    mutationFn: () => pedidosApi.cambiarEstado(pedidoId, destino.id, comentario.trim() || undefined),
    onSuccess: async () => { toast.success(`Pedido en estado: ${ESTADO_LABEL[destino.nombre] ?? destino.nombre}`); await qc.invalidateQueries({ queryKey: ['pedidos'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const tooLong = comentario.length > 500;
  return (
    <Modal title={`Cambiar estado a "${ESTADO_LABEL[destino.nombre] ?? destino.nombre}"`} onClose={onClose}>
      {destino.id === 5 && <Alert tone="warning">Cancelar reintegra la existencia y registra el reembolso al cliente.</Alert>}
      <div style={{ marginTop: '.75rem' }}>
        <TextareaField label="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} error={tooLong ? 'Maximo 500 caracteres.' : undefined} />
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
        <Button variant={destino.id === 5 ? 'danger' : 'primary'} loading={m.isPending} disabled={tooLong} onClick={() => m.mutate()}>Confirmar</Button>
      </div>
    </Modal>
  );
}

function DevolucionModal({ detalle, onClose }: { detalle: PedidoDetalle; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lineas = detalle.lineas.filter((l) => l.cantidadDevolvible > 0);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);

  const seleccion = lineas.map((l) => ({ l, n: Number(cantidades[l.idPedidoDetalle] ?? 0) })).filter((x) => x.n > 0);
  const errLinea = (l: (typeof lineas)[number]) => {
    const n = Number(cantidades[l.idPedidoDetalle] ?? 0);
    if (!Number.isInteger(n) || n < 0) return 'Cantidad invalida.';
    return n > l.cantidadDevolvible ? `Maximo ${l.cantidadDevolvible}.` : undefined;
  };
  const hayErrores = lineas.some((l) => errLinea(l));
  const errMotivo = motivo.trim().length < 3 ? 'El motivo es obligatorio (minimo 3 caracteres).' : undefined;
  const errSeleccion = seleccion.length === 0 ? 'Indique la cantidad a devolver de al menos una linea.' : undefined;
  const estimado = seleccion.reduce((a, x) => a + (x.l.subtotal * x.n) / x.l.cantidad, 0);

  const m = useMutation({
    mutationFn: () => pedidosApi.devolver(detalle.pedido.idPedido, motivo.trim(), seleccion.map((x) => ({ idPedidoDetalle: x.l.idPedidoDetalle, cantidad: x.n }))),
    onSuccess: async (r) => {
      toast.success(`Devolucion registrada. Reembolso: ${formatQ(r.montoReembolsado)}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['pedidos'] }), qc.invalidateQueries({ queryKey: ['inventario'] }), qc.invalidateQueries({ queryKey: ['reportes'] })]);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal title="Registrar devolucion" wide onClose={onClose}>
      <div className="stack">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Producto</th><th className="num">Vendidas</th><th className="num">Ya devueltas</th><th>A devolver</th></tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.idPedidoDetalle}>
                  <td>{l.nombreProducto}<br /><span className="muted small">{l.sku}</span></td>
                  <td className="num">{l.cantidad}</td><td className="num">{l.cantidadDevuelta}</td>
                  <td>
                    <input className="input" type="number" min={0} max={l.cantidadDevolvible} style={{ width: 90 }} aria-label={`Cantidad a devolver de ${l.nombreProducto}`}
                           aria-invalid={Boolean(errLinea(l)) || undefined} value={cantidades[l.idPedidoDetalle] ?? ''} placeholder="0"
                           onChange={(e) => setCantidades((c) => ({ ...c, [l.idPedidoDetalle]: e.target.value }))} />
                    {errLinea(l) && <div className="field-error">{errLinea(l)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TextareaField label="Motivo de la devolucion" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={intento ? errMotivo : undefined} />
        {intento && errSeleccion && <p className="field-error" role="alert">{errSeleccion}</p>}
        <div className="row-between"><span className="muted">Reembolso estimado: <strong>{formatQ(estimado)}</strong></span></div>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
        <Button loading={m.isPending} onClick={() => { setIntento(true); if (!errMotivo && !errSeleccion && !hayErrores) m.mutate(); }}>Registrar devolucion</Button>
      </div>
    </Modal>
  );
}

export default function PedidoAdminPage() {
  const { id } = useParams();
  const idNum = Number(id);
  const [destino, setDestino] = useState<{ id: number; nombre: string } | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);
  const q = useQuery({ queryKey: ['pedidos', 'detalle', idNum], queryFn: () => pedidosApi.detalle(idNum), enabled: Number.isInteger(idNum) && idNum > 0 });
  const trans = useQuery({ queryKey: ['pedidos', 'transiciones'], queryFn: pedidosApi.transiciones, staleTime: 10 * 60_000 });

  if (q.isPending) return <div className="stack"><Skeleton height={100} /><Skeleton height={220} /></div>;
  if (q.isError) return <ErrorState title="No se encontró el pedido" error={q.error} onRetry={() => void q.refetch()} />;

  const estadoId = q.data.pedido.idEstadoPedido;
  // Estados a los que se puede pasar desde el actual (6 y 7 los fija el registro de devoluciones)
  const siguientes = (trans.data ?? []).filter((t) => t.idEstadoOrigen === estadoId && t.idEstadoDestino < 6);

  return (
    <div className="stack">
      <div className="row-between"><Link to="/admin/pedidos" className="small">← Pedidos</Link><LiveBadge /></div>
      <PedidoView detalle={q.data} showCliente>
        <Card>
          <h2>Acciones</h2>
          {trans.isError && <Alert tone="warning">No se pudieron cargar las transiciones permitidas. <Button size="sm" variant="ghost" onClick={() => void trans.refetch()}>Reintentar</Button></Alert>}
          <div className="row">
            {siguientes.map((t) => (
              <Button key={t.idEstadoDestino} variant={t.idEstadoDestino === 5 ? 'danger' : 'primary'}
                      onClick={() => setDestino({ id: t.idEstadoDestino, nombre: t.estadoDestino })}>
                {t.idEstadoDestino === 5 ? 'Cancelar pedido' : `Pasar a ${ESTADO_LABEL[t.estadoDestino] ?? t.estadoDestino}`}
              </Button>
            ))}
            {puedeDevolver(estadoId) && <Button variant="secondary" onClick={() => setDevolviendo(true)}>Registrar devolución</Button>}
            {siguientes.length === 0 && !puedeDevolver(estadoId) && !trans.isError && <span className="muted">No hay acciones disponibles para este estado.</span>}
          </div>
        </Card>
      </PedidoView>
      {destino && <CambiarEstadoModal pedidoId={idNum} destino={destino} onClose={() => setDestino(null)} />}
      {devolviendo && <DevolucionModal detalle={q.data} onClose={() => setDevolviendo(false)} />}
    </div>
  );
}
