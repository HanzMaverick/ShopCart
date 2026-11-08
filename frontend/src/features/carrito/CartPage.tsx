import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { carritoApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback';
import { atributosTexto, formatQ } from '../../lib/format';
import { cuponCodigoSchema } from '../../lib/schemas';
import { QuantityInput } from './QuantityInput';
import { useCart, useCartMutation } from './useCart';

export function CartPage() {
  const { user, isStaff } = useAuth();
  const q = useCart();
  const cambiar = useCartMutation(({ id, n }: { id: number; n: number }) => carritoApi.cambiarCantidad(id, n));
  const quitar = useCartMutation((id: number) => carritoApi.quitar(id), 'Producto eliminado');
  const vaciar = useCartMutation(() => carritoApi.vaciar(), 'Carrito vaciado');
  const aplicar = useCartMutation((codigo: string) => carritoApi.aplicarCupon(codigo), 'Cupón aplicado');
  const quitarCupon = useCartMutation(() => carritoApi.quitarCupon(), 'Cupón retirado');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ codigo: string }>({ resolver: zodResolver(cuponCodigoSchema) });

  if (isStaff) return <Card><EmptyState title="Las cuentas internas no tienen carrito" description="Inicie sesion con una cuenta de cliente para comprar." /></Card>;
  if (q.isPending) return <div className="stack"><Skeleton height={32} width={220} /><Skeleton height={120} /><Skeleton height={120} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const cart = q.data;
  if (cart.lineas.length === 0) {
    return <Card><EmptyState title="Su carrito está vacío" description="Agregue productos desde la tienda." action={<Link className="btn btn-primary" to="/">Ir a la tienda</Link>} /></Card>;
  }
  const hayNoDisponibles = cart.lineas.some((l) => !l.disponible);
  const ocupado = cambiar.isPending || quitar.isPending || vaciar.isPending || aplicar.isPending || quitarCupon.isPending;

  return (
    <>
      <PageHeader title="Carrito de compras" actions={<Button variant="ghost" size="sm" loading={vaciar.isPending} onClick={() => vaciar.mutate()}>Vaciar carrito</Button>} />
      <div className="two-col">
        <Card>
          {cart.lineas.map((l) => (
            <div className="cart-line" key={l.idVariante}>
              {l.imagenUrl ? <img src={l.imagenUrl} alt="" /> : <div aria-hidden="true" style={{ width: 72, height: 72 }} />}
              <div>
                <strong>{l.nombreProducto}</strong>
                <div className="muted small">{atributosTexto(l.atributos)} · SKU {l.sku}</div>
                <div className="small">{formatQ(l.precioUnitario)} c/u</div>
                {!l.disponible && <Badge tone="danger">Sin existencia suficiente</Badge>}
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <QuantityInput value={l.cantidad} max={Math.max(l.existenciaDisponible + l.cantidad, 1)} disabled={ocupado}
                               onChange={(n) => cambiar.mutate({ id: l.idVariante, n })} />
                <div>
                  {l.descuentoLinea > 0 && <span className="muted small" style={{ textDecoration: 'line-through', marginRight: 6 }}>{formatQ(l.subtotal + l.descuentoLinea)}</span>}
                  <strong>{formatQ(l.subtotal)}</strong>
                </div>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => quitar.mutate(l.idVariante)}>Quitar</Button>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <h2>Resumen</h2>
          <form className="row" style={{ alignItems: 'flex-start', marginBottom: '.75rem' }} onSubmit={handleSubmit((v) => { aplicar.mutate(v.codigo, { onSuccess: () => reset() }); })} noValidate>
            <div className="grow"><TextField label="Cupón de descuento" placeholder="CODIGO" autoCapitalize="characters" error={errors.codigo?.message} {...register('codigo')} /></div>
            <Button type="submit" variant="secondary" loading={aplicar.isPending} style={{ marginTop: '1.5rem' }}>Aplicar</Button>
          </form>
          {cart.codigoCupon && (
            <div className="row-between" style={{ marginBottom: '.5rem' }}>
              <Badge tone={cart.cuponAviso ? 'warning' : 'success'}>Cupon {cart.codigoCupon}</Badge>
              <Button size="sm" variant="ghost" onClick={() => quitarCupon.mutate()}>Quitar</Button>
            </div>
          )}
          {cart.cuponAviso && <Alert tone="warning">{cart.cuponAviso}</Alert>}

          <div className="summary-row"><span>Subtotal</span><span>{formatQ(cart.subtotal)}</span></div>
          {cart.descuento > 0 && <div className="summary-row"><span>Descuento</span><span>−{formatQ(cart.descuento)}</span></div>}
          <div className="summary-row summary-total"><span>Total</span><span>{formatQ(cart.total)}</span></div>
          <p className="muted small">IVA (12 %) incluido: {formatQ(cart.montoIVA)}</p>

          {hayNoDisponibles && <Alert tone="error">Hay productos sin existencia suficiente. Ajuste las cantidades para continuar.</Alert>}
          <div style={{ marginTop: '.75rem' }}>
            {user ? (
              <Link className="btn btn-primary btn-block" aria-disabled={hayNoDisponibles} to="/checkout" onClick={(e) => { if (hayNoDisponibles) e.preventDefault(); }}>Ir a pagar</Link>
            ) : (
              <>
                <Link className="btn btn-primary btn-block" to="/login?next=/checkout">Iniciar sesion para pagar</Link>
                <p className="muted small" style={{ marginTop: '.5rem' }}>Su carrito se conserva al ingresar. ¿Sin cuenta? <Link to="/registro?next=/checkout">Crear una</Link></p>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
