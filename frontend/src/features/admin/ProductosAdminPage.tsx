import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { ProductoListado } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, nextSort, type Column } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { SelectField, TextField } from '../../components/ui/fields';
import { Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useUrlState, useUrlTextField } from '../../hooks/useUrlState';
import { errorMessage } from '../../lib/errors';
import { precioRango } from '../../lib/format';
import { ProductoForm } from './ProductoForm';

export default function ProductosAdminPage() {
  const url = useUrlState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useUrlTextField(url, 'texto');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProductoListado | null>(null);

  const sort = { by: url.get('ordenarPor') ?? 'Recientes', dir: (url.get('direccion') === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC' };
  const filtros = { texto: url.get('texto'), idCategoria: url.getNum('idCategoria'), ordenarPor: sort.by, direccion: sort.dir, page: url.page, pageSize: 15 };
  const categorias = useQuery({ queryKey: ['admin', 'categorias'], queryFn: adminApi.categorias.listar });
  const q = useQuery({ queryKey: ['admin', 'productos', filtros], queryFn: () => adminApi.productos.listar(filtros), placeholderData: keepPreviousData });
  const refrescar = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'productos'] }), qc.invalidateQueries({ queryKey: ['tienda'] })]);

  const toggle = useMutation({
    mutationFn: (p: ProductoListado) => adminApi.productos.cambiarEstado(p.idProducto, !p.activo),
    onSuccess: async (r) => { toast.success(r.activo ? 'Producto activado' : 'Producto desactivado'); await refrescar(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => adminApi.productos.eliminar(id),
    onSuccess: async (r) => {
      toast.success(r.resultado === 'Eliminado' ? 'Producto eliminado' : 'El producto tiene historial: se desactivo en lugar de eliminarse');
      setDeleting(null); await refrescar();
    },
    onError: (e) => { toast.error(errorMessage(e)); setDeleting(null); },
  });

  const cols: Column<ProductoListado>[] = [
    { key: 'n', header: 'Producto', sortKey: 'Nombre', cell: (p) => (
      <div className="row nowrap">
        {p.imagenUrl ? <img src={p.imagenUrl} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ width: 40, height: 40 }} aria-hidden="true" />}
        <Link to={`/admin/productos/${p.idProducto}`}><strong>{p.nombre}</strong></Link>
      </div>) },
    { key: 'c', header: 'Categoria', cell: (p) => p.nombreCategoria },
    { key: 'p', header: 'Precio', sortKey: 'Precio', numeric: true, cell: (p) => precioRango(p.precioMin, p.precioMax) },
    { key: 'd', header: 'Disponible', numeric: true, cell: (p) => <Badge tone={p.existenciaDisponible <= 0 ? 'danger' : 'success'}>{p.existenciaDisponible}</Badge> },
    { key: 'e', header: 'Estado', cell: (p) => (p.activo ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>) },
    { key: 'a', header: '', cell: (p) => (
      <div className="row nowrap">
        <Link className="btn btn-secondary btn-sm" to={`/admin/productos/${p.idProducto}`}>Editar</Link>
        <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.idProducto === p.idProducto} onClick={() => toggle.mutate(p)}>{p.activo ? 'Desactivar' : 'Activar'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>Eliminar</Button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Productos" subtitle="Catalogo completo, incluidos los inactivos" actions={<Button onClick={() => setCreating(true)}>Nuevo producto</Button>} />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <TextField label="Buscar" type="search" placeholder="Nombre, descripcion o SKU" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <SelectField label="Categoria" value={url.get('idCategoria') ?? ''} onChange={(e) => url.set({ idCategoria: e.target.value })}>
              <option value="">Todas</option>{categorias.data?.map((c) => <option key={c.idCategoria} value={c.idCategoria}>{c.nombre}</option>)}
            </SelectField>
          </div>
        </Card>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(p) => p.idProducto} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   sort={sort} onSort={(k) => url.set(nextSort(sort, k))} pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="Sin productos con esos filtros" />
      </div>

      {creating && (
        <Modal title="Nuevo producto" onClose={() => setCreating(false)}>
          <p className="muted small">Despues de crearlo podra agregar variantes (SKU, precio, existencia) e imagenes.</p>
          <ProductoForm submitLabel="Crear producto" onCancel={() => setCreating(false)} onSubmit={async (v) => {
            const p = await adminApi.productos.crear(v);
            await refrescar(); toast.success('Producto creado'); navigate(`/admin/productos/${p.idProducto}`);
          }} />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title="Eliminar producto" danger confirmLabel="Eliminar" loading={eliminar.isPending}
          message={<>¿Eliminar <strong>{deleting.nombre}</strong>? Si tiene ventas, movimientos de inventario o esta en carritos, se <strong>desactivara</strong> en lugar de borrarse.</>}
          onConfirm={() => eliminar.mutate(deleting.idProducto)} onCancel={() => setDeleting(null)} />
      )}
    </>
  );
}
