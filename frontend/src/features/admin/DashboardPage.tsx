import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { reportesApi, type Rango } from '../../api/endpoints';
import type { CarritoAbandonado } from '../../api/types';
import { HBarChart, TimeSeriesChart } from '../../components/charts/charts';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { SelectField, TextField } from '../../components/ui/fields';
import { Badge, Card, PageHeader, Skeleton } from '../../components/ui/feedback';
import { QueryPanel } from '../../components/ui/QueryPanel';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { compactQ, daysAgoISO, etiquetaPeriodo, formatCalendarDate, formatDateTime, formatNumber, formatQ, todayISO } from '../../lib/format';
import { EstadoBadge } from '../pedidos/PedidoView';

function Kpi({ label, value, hint, loading }: { label: string; value: string; hint?: string; loading: boolean }) {
  return (
    <Card className="kpi">
      <div className="label">{label}</div>
      {loading ? <Skeleton height={30} width="60%" /> : <div className="value">{value}</div>}
      {hint && !loading && <div className="muted small">{hint}</div>}
    </Card>
  );
}

const columnasAbandonados: Column<CarritoAbandonado>[] = [
  { key: 'cliente', header: 'Cliente', cell: (c) => <>{c.cliente}{c.correo && <><br /><span className="muted small">{c.correo}</span></>}</> },
  { key: 'unidades', header: 'Unidades', numeric: true, cell: (c) => c.unidades },
  { key: 'valor', header: 'Valor', numeric: true, cell: (c) => formatQ(c.valor) },
  { key: 'inactivo', header: 'Inactivo', cell: (c) => <Badge tone="warning">{c.horasInactivo >= 48 ? `${Math.floor(c.horasInactivo / 24)} dias` : `${c.horasInactivo} h`}</Badge> },
  { key: 'ultima', header: 'Ultima actividad', cell: (c) => formatDateTime(c.ultimaActividad) },
];

export default function DashboardPage() {
  const qc = useQueryClient();
  const [desde, setDesde] = useState(daysAgoISO(29));
  const [hasta, setHasta] = useState(todayISO());
  const [agrupacion, setAgrupacion] = useState<'Dia' | 'Semana' | 'Mes'>('Dia');
  const [metrica, setMetrica] = useState<'ventasNetas' | 'pedidos'>('ventasNetas');
  const [horas, setHoras] = useState(24);
  const [pageAb, setPageAb] = useState(1);

  const rangoValido = desde <= hasta;
  const rango: Rango = { desde, hasta };
  const opts = { enabled: rangoValido, placeholderData: keepPreviousData } as const;

  const resumen = useQuery({ queryKey: ['reportes', 'resumen', rango, horas], queryFn: () => reportesApi.resumen(rango, horas), ...opts });
  const ventas = useQuery({ queryKey: ['reportes', 'ventas', rango, agrupacion], queryFn: () => reportesApi.ventas(rango, agrupacion), ...opts });
  const categorias = useQuery({ queryKey: ['reportes', 'categorias', rango], queryFn: () => reportesApi.categorias(rango), ...opts });
  const top = useQuery({ queryKey: ['reportes', 'top', rango], queryFn: () => reportesApi.top(rango, 10), ...opts });
  const estados = useQuery({ queryKey: ['reportes', 'estados', rango], queryFn: () => reportesApi.estados(rango), ...opts });
  const abandonados = useQuery({ queryKey: ['reportes', 'abandonados', horas, pageAb], queryFn: () => reportesApi.abandonados(horas, pageAb, 5), placeholderData: keepPreviousData });

  const r = resumen.data?.resumen;
  const cargando = resumen.isPending;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Datos al momento. No incluye pedidos cancelados ni devueltos del todo; las devoluciones parciales se descuentan."
                  actions={<>{resumen.dataUpdatedAt > 0 && <span className="muted small">Actualizado {new Date(resumen.dataUpdatedAt).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala' })}</span>}<LiveBadge /><Button variant="secondary" onClick={() => void qc.invalidateQueries({ queryKey: ['reportes'] })}>Actualizar</Button></>} />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <TextField label="Desde" type="date" max={hasta} value={desde} onChange={(e) => setDesde(e.target.value)} />
            <TextField label="Hasta" type="date" min={desde} max={todayISO()} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <SelectField label="Agrupar ventas por" value={agrupacion} onChange={(e) => setAgrupacion(e.target.value as typeof agrupacion)}>
              <option value="Dia">Dia</option><option value="Semana">Semana</option><option value="Mes">Mes</option>
            </SelectField>
            <SelectField label="Carrito abandonado tras" value={horas} onChange={(e) => { setHoras(Number(e.target.value)); setPageAb(1); }}>
              {[1, 6, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h < 24 ? `${h} h` : `${h / 24} dia(s)`} sin actividad</option>)}
            </SelectField>
          </div>
          {!rangoValido && <p className="field-error" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
          {resumen.data && <p className="muted small" style={{ marginTop: '.5rem' }}>Periodo: {formatCalendarDate(resumen.data.meta.desde)} al {formatCalendarDate(resumen.data.meta.hasta)} (hora de Guatemala)</p>}
        </Card>

        <div className="kpis">
          <Kpi loading={cargando} label="Ventas netas" value={formatQ(r?.ventasNetas ?? 0)} hint={`Brutas ${formatQ(r?.ventasBrutas ?? 0)}`} />
          <Kpi loading={cargando} label="Pedidos" value={formatNumber(r?.pedidos ?? 0)} hint={`${formatNumber(r?.clientesConCompra ?? 0)} clientes`} />
          <Kpi loading={cargando} label="Ticket promedio" value={formatQ(r?.ticketPromedio ?? 0)} />
          <Kpi loading={cargando} label="Unidades vendidas" value={formatNumber(r?.unidadesVendidas ?? 0)} />
          <Kpi loading={cargando} label="Devoluciones" value={formatQ(r?.devoluciones ?? 0)} />
          <Kpi loading={cargando} label="Carritos abandonados" value={formatNumber(r?.carritosAbandonados ?? 0)} hint={`Valor ${formatQ(r?.valorCarritosAbandonados ?? 0)}`} />
        </div>
        {resumen.isError && !resumen.data && <p className="field-error" role="alert">No se pudieron cargar los indicadores. <Button size="sm" variant="ghost" onClick={() => void resumen.refetch()}>Reintentar</Button></p>}

        <QueryPanel title="Ventas" subtitle={`Por ${agrupacion === 'Dia' ? 'dia' : agrupacion.toLowerCase()}`} query={ventas} isEmpty={(d) => d.data.every((p) => p.pedidos === 0)}>
          {(d) => (
            <>
              <div className="row" style={{ marginBottom: '.5rem' }}>
                <Button size="sm" variant={metrica === 'ventasNetas' ? 'primary' : 'secondary'} onClick={() => setMetrica('ventasNetas')}>Quetzales</Button>
                <Button size="sm" variant={metrica === 'pedidos' ? 'primary' : 'secondary'} onClick={() => setMetrica('pedidos')}>Pedidos</Button>
              </div>
              <TimeSeriesChart ariaLabel={`Ventas por ${agrupacion}`} kind={agrupacion === 'Dia' ? 'line' : 'bars'}
                               format={metrica === 'ventasNetas' ? compactQ : (n) => String(Math.round(n))}
                               data={d.data.map((p) => ({ label: etiquetaPeriodo(p.periodo, agrupacion), value: p[metrica] }))} />
            </>
          )}
        </QueryPanel>

        <div className="dash-grid">
          <QueryPanel title="Ventas por categoria" query={categorias} isEmpty={(d) => d.data.length === 0}>
            {(d) => <HBarChart items={d.data.map((c) => ({ label: c.categoria, value: c.ventasNetas, display: formatQ(c.ventasNetas) }))} />}
          </QueryPanel>
          <QueryPanel title="Top 10 productos" subtitle="Por unidades vendidas" query={top} isEmpty={(d) => d.data.length === 0}>
            {(d) => <HBarChart items={d.data.map((p) => ({ label: p.producto, value: p.unidades, display: `${formatNumber(p.unidades)} u · ${formatQ(p.ventasNetas)}` }))} />}
          </QueryPanel>
          <QueryPanel title="Pedidos por estado" subtitle="Incluye cancelados y devueltos" query={estados} isEmpty={(d) => d.data.every((e) => e.pedidos === 0)}>
            {(d) => (
              <div className="stack-sm">
                {d.data.map((e) => <div className="row-between" key={e.idEstadoPedido}><EstadoBadge estado={e.estado} /><span>{formatNumber(e.pedidos)} · {formatQ(e.monto)}</span></div>)}
              </div>
            )}
          </QueryPanel>
        </div>

        <Card>
          <h2>Carritos abandonados</h2>
          <p className="muted small">Carritos con productos y sin actividad por mas de {horas} h. {abandonados.data && `Valor total: ${formatQ(abandonados.data.valorTotal)}`}</p>
          <DataTable columns={columnasAbandonados} rows={abandonados.data?.data} rowKey={(c) => c.idCarrito} loading={abandonados.isPending} fetching={abandonados.isFetching}
                     error={abandonados.error} onRetry={() => void abandonados.refetch()} pagination={abandonados.data?.pagination} onPageChange={setPageAb}
                     emptyTitle="Sin carritos abandonados" emptyDescription="No hay carritos inactivos en este periodo." />
        </Card>
      </div>
    </>
  );
}
