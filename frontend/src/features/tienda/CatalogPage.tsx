import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tiendaApi, type FiltrosTienda } from '../../api/endpoints';
import type { ProductoListado } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Checkbox, SelectField, TextField } from '../../components/ui/fields';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback';
import { Pager } from '../../components/ui/Pager';
import { useUrlState, useUrlTextField } from '../../hooks/useUrlState';
import { precioRango } from '../../lib/format';

const ORDEN: Record<string, { ordenarPor: string; direccion: string; label: string }> = {
  recientes: { ordenarPor: 'Recientes', direccion: 'DESC', label: 'Mas recientes' },
  nombre: { ordenarPor: 'Nombre', direccion: 'ASC', label: 'Nombre (A-Z)' },
  precioAsc: { ordenarPor: 'Precio', direccion: 'ASC', label: 'Precio: menor a mayor' },
  precioDesc: { ordenarPor: 'Precio', direccion: 'DESC', label: 'Precio: mayor a menor' },
};

function ProductCard({ p }: { p: ProductoListado }) {
  const agotado = p.existenciaDisponible <= 0;
  return (
    <Link to={`/producto/${p.idProducto}`} className="card product-card">
      {p.imagenUrl ? <img className="product-img" src={p.imagenUrl} alt={p.nombre} loading="lazy" /> : <div className="product-img" aria-hidden="true" />}
      <div className="product-body">
        <span className="muted small">{p.nombreCategoria}</span>
        <strong>{p.nombre}</strong>
        <span className="price">{precioRango(p.precioMin, p.precioMax)}</span>
        {agotado ? <Badge tone="danger">Agotado</Badge> : p.existenciaDisponible <= 5 ? <Badge tone="warning">Ultimas unidades</Badge> : null}
      </div>
    </Link>
  );
}

export function CatalogPage() {
  const url = useUrlState();
  const [texto, setTexto] = useUrlTextField(url, 'texto');
  const [precioMin, setPrecioMin] = useUrlTextField(url, 'precioMin');
  const [precioMax, setPrecioMax] = useUrlTextField(url, 'precioMax');
  const orden = ORDEN[url.get('orden') ?? 'recientes'] ?? ORDEN['recientes']!;

  const filtros: FiltrosTienda = {
    texto: url.get('texto'), idCategoria: url.getNum('idCategoria'), precioMin: url.getNum('precioMin'), precioMax: url.getNum('precioMax'),
    soloDisponibles: url.getBool('disponibles'), ordenarPor: orden.ordenarPor, direccion: orden.direccion, page: url.page, pageSize: 12,
  };

  const categorias = useQuery({ queryKey: ['tienda', 'categorias'], queryFn: tiendaApi.categorias, staleTime: 5 * 60_000 });
  const q = useQuery({ queryKey: ['tienda', 'productos', filtros], queryFn: () => tiendaApi.productos(filtros), placeholderData: keepPreviousData });

  const hayFiltros = Boolean(url.get('texto') || url.get('idCategoria') || url.get('precioMin') || url.get('precioMax') || url.getBool('disponibles'));
  const limpiar = () => { setTexto(''); setPrecioMin(''); setPrecioMax(''); url.set({ texto: null, idCategoria: null, precioMin: null, precioMax: null, disponibles: null, orden: null }); };

  return (
    <>
      <PageHeader title="Tienda" subtitle="Encuentre lo que busca" />
      <Card className="card-flat">
        <div className="filters" role="search">
          <TextField label="Buscar" type="search" placeholder="Nombre, descripcion o SKU" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <SelectField label="Categoria" value={url.get('idCategoria') ?? ''} onChange={(e) => url.set({ idCategoria: e.target.value })}>
            <option value="">Todas</option>
            {categorias.data?.map((c) => <option key={c.idCategoria} value={c.idCategoria}>{c.nombre}</option>)}
          </SelectField>
          <TextField label="Precio minimo (Q)" type="number" min={0} inputMode="decimal" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} />
          <TextField label="Precio maximo (Q)" type="number" min={0} inputMode="decimal" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />
          <SelectField label="Ordenar por" value={url.get('orden') ?? 'recientes'} onChange={(e) => url.set({ orden: e.target.value === 'recientes' ? null : e.target.value })}>
            {Object.entries(ORDEN).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
          </SelectField>
          <Checkbox label="Solo disponibles" checked={url.getBool('disponibles') ?? false} onChange={(e) => url.set({ disponibles: e.target.checked })} />
        </div>
        {hayFiltros && <div style={{ marginTop: '.75rem' }}><Button size="sm" variant="ghost" onClick={limpiar}>Limpiar filtros</Button></div>}
      </Card>

      <div style={{ marginTop: '1rem' }} aria-busy={q.isFetching}>
        {q.isError && !q.data && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
        {q.isPending && <div className="product-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={280} />)}</div>}
        {q.data && q.data.data.length === 0 && <Card><EmptyState title="No encontramos productos" description="Pruebe con otros filtros." action={hayFiltros ? <Button variant="secondary" onClick={limpiar}>Limpiar filtros</Button> : undefined} /></Card>}
        {q.data && q.data.data.length > 0 && (
          <div className="product-grid" style={q.isFetching ? { opacity: 0.6 } : undefined}>{q.data.data.map((p) => <ProductCard key={p.idProducto} p={p} />)}</div>
        )}
        <Pager pagination={q.data?.pagination} fetching={q.isFetching} onPageChange={(page) => { url.set({ page }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      </div>
    </>
  );
}
