import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { VarianteAdmin } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { TextField } from '../../components/ui/fields';
import { Alert, Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { atributosTexto, formatQ } from '../../lib/format';
import { imagenSchema, paresAObjeto, precioSchema, varianteCrearSchema, type VarianteCrearForm } from '../../lib/schemas';
import { ProductoForm } from './ProductoForm';

/*Variantes*/
function VarianteModal({ idProducto, variante, onClose, onSaved }: { idProducto: number; variante: VarianteAdmin | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const edicion = variante !== null;
  const [formError, setFormError] = useState<string | null>(null);
  // En edicion el precio y la existencia no se envian (tienen su propio flujo y auditoria): se rellenan con valores validos
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<VarianteCrearForm>({
    resolver: zodResolver(varianteCrearSchema),
    defaultValues: {
      sku: variante?.sku ?? '', precio: variante?.precio ?? (Number.NaN), existenciaInicial: 0,
      atributos: variante ? Object.entries(variante.atributos).map(([clave, valor]) => ({ clave, valor })) : [{ clave: '', valor: '' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'atributos' });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    const atributos = paresAObjeto(v.atributos);
    try {
      if (variante) await adminApi.variantes.actualizar(variante.idVariante, { sku: v.sku, atributos });
      else await adminApi.variantes.crear(idProducto, { sku: v.sku, atributos, precio: v.precio, existenciaInicial: v.existenciaInicial });
      toast.success(edicion ? 'Variante actualizada' : 'Variante creada');
      await onSaved(); onClose();
    } catch (e) { if (!applyServerErrors(e, setError, ['sku', 'precio', 'existenciaInicial'])) setFormError(errorMessage(e)); }
  });

  return (
    <Modal title={edicion ? `Editar variante ${variante.sku}` : 'Nueva variante'} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="SKU (unico)" error={errors.sku?.message} {...register('sku')} />
        {!edicion && (
          <div className="form-grid">
            <TextField label="Precio (Q, IVA incluido)" type="number" step="0.01" min={0} error={errors.precio?.message} {...register('precio', { valueAsNumber: true })} />
            <TextField label="Existencia inicial" type="number" min={0} error={errors.existenciaInicial?.message} hint="Se registra como entrada en el kardex." {...register('existenciaInicial', { valueAsNumber: true })} />
          </div>
        )}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.75rem' }}>
          <legend className="small"><strong>Atributos</strong> (talla, color...)</legend>
          <div className="stack-sm">
            {fields.map((f, i) => (
              <div className="row" style={{ alignItems: 'flex-start' }} key={f.id}>
                <div className="grow"><TextField label="Nombre" placeholder="talla" error={errors.atributos?.[i]?.clave?.message} {...register(`atributos.${i}.clave`)} /></div>
                <div className="grow"><TextField label="Valor" placeholder="M" error={errors.atributos?.[i]?.valor?.message} {...register(`atributos.${i}.valor`)} /></div>
                <Button variant="ghost" size="sm" style={{ marginTop: '1.5rem' }} aria-label={`Quitar atributo ${i + 1}`} onClick={() => remove(i)}>Quitar</Button>
              </div>
            ))}
            {errors.atributos?.message && <span className="field-error" role="alert">{errors.atributos.message}</span>}
            <div><Button variant="secondary" size="sm" disabled={fields.length >= 6} onClick={() => append({ clave: '', valor: '' })}>Agregar atributo</Button></div>
          </div>
        </fieldset>
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Guardar</Button></div>
      </form>
    </Modal>
  );
}

function PrecioModal({ variante, onClose, onSaved }: { variante: VarianteAdmin; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ precio: number }>({ resolver: zodResolver(precioSchema), defaultValues: { precio: variante.precio } });
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await adminApi.variantes.cambiarPrecio(variante.idVariante, v.precio); toast.success('Precio actualizado'); await onSaved(); onClose(); } catch (e) { setFormError(errorMessage(e)); }
  });
  return (
    <Modal title={`Precio de ${variante.sku}`} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <Alert tone="info">El cambio solo afecta compras futuras: los pedidos ya realizados conservan el precio con el que se vendieron.</Alert>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Nuevo precio (Q, IVA incluido)" type="number" step="0.01" min={0} hint={`Actual: ${formatQ(variante.precio)}`} error={errors.precio?.message} {...register('precio', { valueAsNumber: true })} />
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Guardar precio</Button></div>
      </form>
    </Modal>
  );
}

/*Imagenes*/
function ImagenForm({ idProducto, siguienteOrden, onSaved }: { idProducto: number; siguienteOrden: number; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<{ url: string; orden: number }>({
    resolver: zodResolver(imagenSchema), defaultValues: { url: '', orden: siguienteOrden },
  });
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await adminApi.productos.agregarImagen(idProducto, v.url, v.orden); toast.success('Imagen agregada'); await onSaved(); reset({ url: '', orden: siguienteOrden + 1 }); }
    catch (e) { if (!applyServerErrors(e, setError, ['url', 'orden'])) setFormError(errorMessage(e)); }
  });
  return (
    <form className="stack-sm" onSubmit={submit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><TextField label="URL de la imagen" type="url" placeholder="https://..." error={errors.url?.message} {...register('url')} /></div>
        <div style={{ width: 110 }}><TextField label="Orden" type="number" min={0} error={errors.orden?.message} {...register('orden', { valueAsNumber: true })} /></div>
        <Button type="submit" variant="secondary" loading={isSubmitting} style={{ marginTop: '1.5rem' }}>Agregar</Button>
      </div>
    </form>
  );
}

/*Pagina*/
export default function ProductoAdminPage() {
  const { id } = useParams();
  const idNum = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [varianteModal, setVarianteModal] = useState<VarianteAdmin | 'nueva' | null>(null);
  const [precioModal, setPrecioModal] = useState<VarianteAdmin | null>(null);
  const [borrandoImagen, setBorrandoImagen] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const q = useQuery({ queryKey: ['admin', 'producto', idNum], queryFn: () => adminApi.productos.obtener(idNum), enabled: Number.isInteger(idNum) && idNum > 0 });
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'producto', idNum] }), qc.invalidateQueries({ queryKey: ['admin', 'productos'] }),
    qc.invalidateQueries({ queryKey: ['tienda'] }), qc.invalidateQueries({ queryKey: ['inventario'] }),
  ]);

  const estadoProducto = useMutation({
    mutationFn: (activo: boolean) => adminApi.productos.cambiarEstado(idNum, activo),
    onSuccess: async (r) => { toast.success(r.activo ? 'Producto activado' : 'Producto desactivado'); await refrescar(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const estadoVariante = useMutation({
    mutationFn: (v: VarianteAdmin) => adminApi.variantes.cambiarEstado(v.idVariante, !v.activa),
    onSuccess: async (r) => { toast.success(r.activa ? 'Variante activada' : 'Variante desactivada'); await refrescar(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const quitarImagen = useMutation({
    mutationFn: (idImagen: number) => adminApi.productos.eliminarImagen(idImagen),
    onSuccess: async () => { toast.success('Imagen eliminada'); setBorrandoImagen(null); await refrescar(); },
    onError: (e) => { toast.error(errorMessage(e)); setBorrandoImagen(null); },
  });
  const eliminar = useMutation({
    mutationFn: () => adminApi.productos.eliminar(idNum),
    onSuccess: async (r) => {
      toast.success(r.resultado === 'Eliminado' ? 'Producto eliminado' : 'El producto tiene historial: se desactivo en lugar de eliminarse');
      await refrescar();
      if (r.resultado === 'Eliminado') navigate('/admin/productos', { replace: true }); else setEliminando(false);
    },
    onError: (e) => { toast.error(errorMessage(e)); setEliminando(false); },
  });

  if (q.isPending) return <div className="stack"><Skeleton height={36} width={320} /><Skeleton height={200} /><Skeleton height={200} /></div>;
  if (q.isError) return <ErrorState title="No se encontro el producto" error={q.error} onRetry={() => void q.refetch()} />;

  const { producto, variantes, imagenes } = q.data;
  const cols: Column<VarianteAdmin>[] = [
    { key: 'sku', header: 'SKU', cell: (v) => <code>{v.sku}</code> },
    { key: 'at', header: 'Atributos', cell: (v) => atributosTexto(v.atributos) || <span className="muted">-</span> },
    { key: 'pr', header: 'Precio', numeric: true, cell: (v) => formatQ(v.precio) },
    { key: 'ex', header: 'Disponible', numeric: true, cell: (v) => <Badge tone={v.existenciaDisponible <= 0 ? 'danger' : 'success'}>{v.existenciaDisponible}</Badge> },
    { key: 'es', header: 'Estado', cell: (v) => (v.activa ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>) },
    { key: 'ac', header: '', cell: (v) => (
      <div className="row nowrap">
        <Button size="sm" variant="secondary" onClick={() => setVarianteModal(v)}>Editar</Button>
        <Button size="sm" variant="secondary" onClick={() => setPrecioModal(v)}>Precio</Button>
        <Button size="sm" variant="ghost" loading={estadoVariante.isPending && estadoVariante.variables?.idVariante === v.idVariante} onClick={() => estadoVariante.mutate(v)}>{v.activa ? 'Desactivar' : 'Activar'}</Button>
      </div>) },
  ];

  return (
    <div className="stack">
      <Link to="/admin/productos" className="small">← Productos</Link>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div><h1>{producto.nombre}</h1>{producto.activo ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>} <span className="muted small">{producto.nombreCategoria}</span></div>
        <div className="row">
          <Button variant="secondary" loading={estadoProducto.isPending} onClick={() => estadoProducto.mutate(!producto.activo)}>{producto.activo ? 'Desactivar' : 'Activar'}</Button>
          <Button variant="danger" onClick={() => setEliminando(true)}>Eliminar</Button>
        </div>
      </div>

      <Card>
        <h2>Datos generales</h2>
        <ProductoForm initial={producto} submitLabel="Guardar cambios" onSubmit={async (v) => { await adminApi.productos.actualizar(idNum, v); toast.success('Producto actualizado'); await refrescar(); }} />
      </Card>

      <Card>
        <div className="row-between"><h2>Variantes</h2><Button onClick={() => setVarianteModal('nueva')}>Nueva variante</Button></div>
        <p className="muted small">La existencia se administra en <Link to="/admin/inventario">Inventario</Link> (entradas y ajustes con kardex).</p>
        {variantes.length === 0 && <EmptyState title="Sin variantes" description="El producto no se muestra en la tienda hasta tener al menos una variante activa." />}
        {variantes.length > 0 && <DataTable columns={cols} rows={variantes} rowKey={(v) => v.idVariante} loading={false} />}
      </Card>

      <Card>
        <h2>Imagenes</h2>
        {imagenes.length === 0 ? <p className="muted">Aun no hay imagenes.</p> : (
          <div className="product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', marginBottom: '1rem' }}>
            {imagenes.map((im) => (
              <div key={im.idImagenProducto} className="stack-sm">
                <img src={im.url} alt={`Imagen ${im.orden}`} style={{ aspectRatio: '1', objectFit: 'cover', borderRadius: 8, width: '100%' }} />
                <div className="row-between"><span className="muted small">Orden {im.orden}</span><Button size="sm" variant="ghost" onClick={() => setBorrandoImagen(im.idImagenProducto)}>Quitar</Button></div>
              </div>
            ))}
          </div>
        )}
        <ImagenForm idProducto={idNum} siguienteOrden={imagenes.length} onSaved={refrescar} />
      </Card>

      {varianteModal && <VarianteModal idProducto={idNum} variante={varianteModal === 'nueva' ? null : varianteModal} onClose={() => setVarianteModal(null)} onSaved={refrescar} />}
      {precioModal && <PrecioModal variante={precioModal} onClose={() => setPrecioModal(null)} onSaved={refrescar} />}
      {borrandoImagen !== null && <ConfirmDialog title="Quitar imagen" danger confirmLabel="Quitar" loading={quitarImagen.isPending} message="¿Quitar esta imagen del producto?" onConfirm={() => quitarImagen.mutate(borrandoImagen)} onCancel={() => setBorrandoImagen(null)} />}
      {eliminando && <ConfirmDialog title="Eliminar producto" danger confirmLabel="Eliminar" loading={eliminar.isPending}
        message={<>¿Eliminar <strong>{producto.nombre}</strong>? Si tiene ventas, movimientos de inventario o esta en carritos, se <strong>desactivara</strong> en lugar de borrarse.</>}
        onConfirm={() => eliminar.mutate()} onCancel={() => setEliminando(false)} />}
    </div>
  );
}
