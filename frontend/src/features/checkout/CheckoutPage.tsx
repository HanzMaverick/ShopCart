import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkoutApi, direccionesApi } from '../../api/endpoints';
import { ApiError } from '../../api/http';
import type { MetodoPago } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Alert, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback';
import { mmss, useCountdown } from '../../hooks/useCountdown';
import { errorMessage } from '../../lib/errors';
import { atributosTexto, formatQ } from '../../lib/format';
import { CART_KEY, useCart } from '../carrito/useCart';
import { DireccionForm } from '../cuenta/DireccionForm';
import { DIRECCIONES_KEY, useDirecciones } from '../cuenta/DireccionesPage';

/**
 * Idempotency-Key del intento de pago. Se conserva en sessionStorage: un reintento tras una falla de red o una recarga
 * reutiliza la MISMA clave (el servidor devuelve el mismo pedido, sin segundo cobro). Se renueva al terminar o ante un rechazo.
 */
const IDEM_KEY = 'shopcart.idemKey';
function currentKey(): string {
  let k = sessionStorage.getItem(IDEM_KEY);
  if (!k) { k = crypto.randomUUID(); sessionStorage.setItem(IDEM_KEY, k); }
  return k;
}
const rotateKey = () => sessionStorage.removeItem(IDEM_KEY);

const METODOS: { id: MetodoPago; titulo: string; detalle: string }[] = [
  { id: 'Tarjeta', titulo: 'Tarjeta de credito o debito', detalle: 'Cobro inmediato (pasarela simulada).' },
  { id: 'Transferencia', titulo: 'Transferencia bancaria', detalle: 'Se registra como pago aprobado (simulado).' },
  { id: 'Efectivo', titulo: 'Efectivo contra entrega', detalle: 'Se registra como pago aprobado (simulado).' },
];

export function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cart = useCart();
  const dirs = useDirecciones();
  const [dirId, setDirId] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('Tarjeta');
  const [nuevaDir, setNuevaDir] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  const segundos = useCountdown(cart.data?.reservaExpira);
  const reservaActiva = segundos > 0;
  const reservaExpirada = Boolean(cart.data?.reservaExpira) && !reservaActiva;

  useEffect(() => { if (dirId === null && dirs.data && dirs.data.length > 0) setDirId(dirs.data[0]!.idDireccion); }, [dirs.data, dirId]);
  useEffect(() => { if (reservaExpirada) void qc.invalidateQueries({ queryKey: CART_KEY }); }, [reservaExpirada, qc]);

  const iniciar = useMutation({
    mutationFn: checkoutApi.iniciar,
    onSuccess: (r) => toast.success(`Existencia reservada por ${r.minutosReserva} minutos`),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CART_KEY }),
  });

  const pagar = useMutation({
    mutationFn: () => checkoutApi.pagar(currentKey(), { idDireccion: dirId!, metodoPago: metodo, totalEsperado: cart.data!.total }),
    onSuccess: async (r) => {
      rotateKey();
      await Promise.all([qc.invalidateQueries({ queryKey: CART_KEY }), qc.invalidateQueries({ queryKey: ['pedidos'] })]);
      navigate(`/pedidos/${r.pedido.idPedido}`, { replace: true, state: { nuevo: true, repetida: r.repetida } });
    },
    onError: async (e) => {
      // Falla de red: se conserva la clave (reintento seguro). Cualquier otro rechazo: intento nuevo con clave nueva.
      if (!(e instanceof ApiError && e.isNetwork)) rotateKey();
      setPagoError(e instanceof ApiError && e.isNetwork ? `${e.message} Puede reintentar: no se duplicara el cobro.` : errorMessage(e));
      await qc.invalidateQueries({ queryKey: CART_KEY });
    },
  });

  if (cart.isPending || dirs.isPending) return <div className="stack"><Skeleton height={32} width={240} /><Skeleton height={160} /><Skeleton height={160} /></div>;
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;
  if (dirs.isError) return <ErrorState error={dirs.error} onRetry={() => void dirs.refetch()} />;

  const c = cart.data;
  if (c.lineas.length === 0) return <Card><EmptyState title="No hay productos para pagar" action={<Link className="btn btn-primary" to="/">Ir a la tienda</Link>} /></Card>;

  const noDisponible = c.lineas.some((l) => !l.disponible);
  const puedeReservar = dirId !== null && !noDisponible && !iniciar.isPending && !pagar.isPending;
  const puedePagar = reservaActiva && dirId !== null && !noDisponible;

  return (
    <>
      <PageHeader title="Finalizar compra" />
      <div className="two-col">
        <div className="stack">
          <Card>
            <div className="row-between"><h2>1. Direccion de entrega</h2><Button size="sm" variant="secondary" onClick={() => setNuevaDir(true)}>Nueva direccion</Button></div>
            {dirs.data.length === 0 && <Alert tone="warning">Agregue una direccion para continuar.</Alert>}
            <div className="stack-sm">
              {dirs.data.map((d) => (
                <label key={d.idDireccion} className="radio-card">
                  <input type="radio" name="direccion" checked={dirId === d.idDireccion} onChange={() => setDirId(d.idDireccion)} disabled={reservaActiva} />
                  <span><strong>{d.alias}</strong><br /><span className="muted small">{d.linea1}{d.linea2 ? `, ${d.linea2}` : ''}, {d.ciudad}, {d.departamento} · Tel. {d.telefono}</span></span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2>2. Metodo de pago</h2>
            <div className="stack-sm">
              {METODOS.map((m) => (
                <label key={m.id} className="radio-card">
                  <input type="radio" name="metodo" checked={metodo === m.id} onChange={() => setMetodo(m.id)} disabled={pagar.isPending} />
                  <span><strong>{m.titulo}</strong><br /><span className="muted small">{m.detalle}</span></span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2>3. Reservar existencia y pagar</h2>
            {noDisponible && <Alert tone="error">Hay productos sin existencia suficiente. <Link to="/carrito">Revise su carrito</Link>.</Alert>}
            {reservaExpirada && <Alert tone="warning">Su reserva expiro. Vuelva a reservar para continuar.</Alert>}
            {pagoError && <Alert tone="error">{pagoError}</Alert>}
            {!reservaActiva ? (
              <div className="stack-sm">
                <p className="muted">Al continuar, apartamos las unidades de su carrito durante 15 minutos para que nadie mas las compre mientras paga.</p>
                <Button onClick={() => { setPagoError(null); iniciar.mutate(); }} loading={iniciar.isPending} disabled={!puedeReservar}>Reservar existencia (15 min)</Button>
              </div>
            ) : (
              <div className="stack-sm">
                <Alert tone="success">Existencia reservada. Tiempo restante: <span className="timer">{mmss(segundos)}</span></Alert>
                <Button onClick={() => { setPagoError(null); pagar.mutate(); }} loading={pagar.isPending} disabled={!puedePagar}>Pagar {formatQ(c.total)}</Button>
                <span className="muted small">Si hace doble clic o falla su conexion, no se generara un segundo pedido ni un segundo cobro.</span>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2>Su pedido</h2>
          {c.lineas.map((l) => (
            <div className="summary-row" key={l.idVariante}>
              <span>{l.cantidad} × {l.nombreProducto}<br /><span className="muted small">{atributosTexto(l.atributos)}</span></span><span>{formatQ(l.subtotal)}</span>
            </div>
          ))}
          <div className="summary-row" style={{ borderTop: '1px solid var(--border)', marginTop: '.5rem' }}><span>Subtotal</span><span>{formatQ(c.subtotal)}</span></div>
          {c.descuento > 0 && <div className="summary-row"><span>Descuento {c.codigoCupon && `(${c.codigoCupon})`}</span><span>−{formatQ(c.descuento)}</span></div>}
          <div className="summary-row summary-total"><span>Total</span><span>{formatQ(c.total)}</span></div>
          <p className="muted small">IVA (12 %) incluido: {formatQ(c.montoIVA)}</p>
          {!reservaActiva && <Link to="/carrito" className="small">Modificar carrito</Link>}
        </Card>
      </div>

      {nuevaDir && (
        <Modal title="Nueva direccion" onClose={() => setNuevaDir(false)}>
          <DireccionForm onCancel={() => setNuevaDir(false)} onSubmit={async (d) => {
            const creada = await direccionesApi.crear(d);
            await qc.invalidateQueries({ queryKey: DIRECCIONES_KEY });
            setDirId(creada.idDireccion); setNuevaDir(false);
          }} />
        </Modal>
      )}
    </>
  );
}
