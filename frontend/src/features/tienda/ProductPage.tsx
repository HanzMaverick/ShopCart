import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { carritoApi, tiendaApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, Card, ErrorState, Skeleton } from '../../components/ui/feedback';
import { atributosTexto, formatQ } from '../../lib/format';
import { QuantityInput } from '../carrito/QuantityInput';
import { useCartMutation } from '../carrito/useCart';

export function ProductPage() {
  const { id } = useParams();
  const idNum = Number(id);
  const { isStaff } = useAuth();
  const q = useQuery({ queryKey: ['tienda', 'producto', idNum], queryFn: () => tiendaApi.producto(idNum), enabled: Number.isInteger(idNum) && idNum > 0 });
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const add = useCartMutation(({ idVariante, cantidad }: { idVariante: number; cantidad: number }) => carritoApi.agregar(idVariante, cantidad), 'Producto agregado al carrito');

  const variantes = q.data?.variantes ?? [];
  useEffect(() => {   // variante inicial: la primera con existencia
    if (variantId === null && variantes.length > 0) setVariantId((variantes.find((v) => v.existenciaDisponible > 0) ?? variantes[0])!.idVariante);
  }, [variantes, variantId]);

  if (q.isPending) return <div className="product-detail"><Skeleton height={380} /><div className="stack"><Skeleton height={32} /><Skeleton height={20} /><Skeleton height={120} /></div></div>;
  if (q.isError) return <ErrorState title="No se encontró el producto" error={q.error} onRetry={() => void q.refetch()} />;

  const { producto, imagenes } = q.data;
  const variante = variantes.find((v) => v.idVariante === variantId);
  const disponible = variante?.existenciaDisponible ?? 0;
  const cantidad = Math.min(Math.max(qty, 1), Math.max(disponible, 1));

  return (
    <>
      <p className="small"><Link to="/">Tienda</Link> / <span className="muted">{producto.nombreCategoria}</span></p>
      <div className="product-detail">
        <div>
          {imagenes.length > 0 ? <img className="gallery-main" src={imagenes[img]?.url} alt={producto.nombre} /> : <div className="gallery-main" aria-hidden="true" />}
          {imagenes.length > 1 && (
            <div className="thumbs">
              {imagenes.map((im, i) => <button key={im.idImagenProducto} type="button" aria-pressed={i === img} aria-label={`Imagen ${i + 1}`} onClick={() => setImg(i)}><img src={im.url} alt="" /></button>)}
            </div>
          )}
        </div>
        <Card>
          <div className="stack">
            <div><h1>{producto.nombre}</h1><span className="muted">{producto.nombreCategoria}</span></div>
            {producto.descripcion && <p>{producto.descripcion}</p>}
            {variante && <div className="price" style={{ fontSize: '1.6rem' }}>{formatQ(variante.precio)} <span className="muted small">IVA incluido</span></div>}

            <div>
              <strong className="small">Opciones</strong>
              <div className="chip-group" role="group" aria-label="Variantes">
                {variantes.map((v) => (
                  <button key={v.idVariante} type="button" className="chip" aria-pressed={v.idVariante === variantId} disabled={v.existenciaDisponible <= 0}
                          onClick={() => { setVariantId(v.idVariante); setQty(1); }}>
                    {atributosTexto(v.atributos) || v.sku}<br /><span className="muted small">{formatQ(v.precio)}</span>
                  </button>
                ))}
              </div>
            </div>

            {variante && (disponible <= 0 ? <Badge tone="danger">Agotado</Badge> : <span className="muted small">{disponible <= 5 ? `Solo quedan ${disponible}` : 'Disponible'} · SKU {variante.sku}</span>)}

            {isStaff ? <Alert tone="info">Las cuentas internas no pueden comprar. Utilice una cuenta de cliente.</Alert> : (
              <div className="row">
                <QuantityInput value={cantidad} max={Math.max(disponible, 1)} onChange={setQty} disabled={disponible <= 0} />
                <Button loading={add.isPending} disabled={!variante || disponible <= 0}
                        onClick={() => variante && add.mutate({ idVariante: variante.idVariante, cantidad })}>Agregar al carrito</Button>
                {add.isSuccess && <Link to="/carrito">Ver carrito</Link>}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
