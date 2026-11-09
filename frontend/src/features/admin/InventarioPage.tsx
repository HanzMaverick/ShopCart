import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { inventarioApi, tiendaApi } from '../../api/endpoints';
import type { ExistenciaFila, KardexFila } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { SelectField, TextField, TextareaField } from '../../components/ui/fields';
import { Alert, Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useUrlState, useUrlTextField } from '../../hooks/useUrlState';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { atributosTexto, formatDateTime } from '../../lib/format';
import { ajusteSchema, entradaSchema, type MovimientoForm } from '../../lib/schemas';

function MovimientoModal({ fila, tipo, onClose }: { fila: ExistenciaFila; tipo: 'entrada' | 'ajuste'; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<MovimientoForm>({ resolver: zodResolver(tipo === 'entrada' ? entradaSchema : ajusteSchema) });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const r = tipo === 'entrada' ? await inventarioApi.entrada(fila.idVariante, v.cantidad, v.motivo) : await inventarioApi.ajuste(fila.idVariante, v.cantidad, v.motivo);
      toast.success(`Existencia fisica actual: ${r.existenciaFisica}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['inventario'] }), qc.invalidateQueries({ queryKey: ['tienda'] })]);
      onClose();
    } catch (e) {
      if (!applyServerErrors(e, setError, ['cantidad', 'motivo'])) setFormError(errorMessage(e));
    }
  });

  return (
    <Modal title={tipo === 'entrada' ? 'Registrar entrada' : 'Ajuste manual'} onClose={onClose}>
      <p><strong>{fila.nombreProducto}</strong> <span className="muted small">{atributosTexto(fila.atributos)} · {fila.sku}</span><br />
        Fisica {fila.existenciaFisica} · Reservada {fila.existenciaReservada} · Disponible {fila.existenciaDisponible}</p>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label={tipo === 'entrada' ? 'Cantidad que ingresa' : 'Cantidad del ajuste (+ suma, − resta)'} type="number" step={1} error={errors.cantidad?.message}
                   hint={tipo === 'ajuste' ? 'No puede dejar la existencia en negativo ni por debajo de lo reservado.' : undefined} {...register('cantidad', { valueAsNumber: true })} />
        <TextareaField label="Motivo" error={errors.motivo?.message} {...register('motivo')} />
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Guardar</Button></div>
      </form>
    </Modal>
  );
}

const TIPO_TONE = { Entrada: 'success', Salida: 'danger', Ajuste: 'warning', Devolucion: 'info' } as const;

function KardexModal({ fila, onClose }: { fila: ExistenciaFila; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState('');
  const q = useQuery({ queryKey: ['inventario', 'kardex', fila.idVariante, tipo, page], queryFn: () => inventarioApi.kardex(fila.idVariante, { tipo: tipo || undefined, page, pageSize: 8 }), placeholderData: keepPreviousData });
  const cols: Column<KardexFila>[] = [
    { key: 'f', header: 'Fecha', cell: (k) => formatDateTime(k.fecha) },
    { key: 't', header: 'Tipo', cell: (k) => <Badge tone={TIPO_TONE[k.tipoMovimiento as keyof typeof TIPO_TONE] ?? 'neutral'}>{k.tipoMovimiento}</Badge> },
    { key: 'c', header: 'Cantidad', numeric: true, cell: (k) => (k.cantidad > 0 ? `+${k.cantidad}` : k.cantidad) },
    { key: 'e', header: 'Existencia', numeric: true, cell: (k) => k.existenciaResultante },
    { key: 'm', header: 'Motivo', cell: (k) => <>{k.motivo}<br /><span className="muted small">{k.nombreUsuario}</span></> },
  ];
  return (
    <Modal title={`Kardex · ${fila.sku}`} wide onClose={onClose}>
      <div className="stack">
        <SelectField label="Tipo de movimiento" value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="Entrada">Entrada</option><option value="Salida">Salida</option><option value="Ajuste">Ajuste</option><option value="Devolucion">Devolucion</option>
        </SelectField>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(k) => k.idKardex} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   pagination={q.data?.pagination} onPageChange={setPage} emptyTitle="Sin movimientos" />
      </div>
    </Modal>
  );
}

export default function InventarioPage() {
  const url = useUrlState();
  const [texto, setTexto] = useUrlTextField(url, 'texto');
  const [umbral, setUmbral] = useUrlTextField(url, 'umbral');
  const [modal, setModal] = useState<{ fila: ExistenciaFila; accion: 'entrada' | 'ajuste' | 'kardex' } | null>(null);

  const filtros = { texto: url.get('texto'), idCategoria: url.getNum('idCategoria'), umbralBajo: url.getNum('umbral'), page: url.page, pageSize: 15 };
  const categorias = useQuery({ queryKey: ['tienda', 'categorias'], queryFn: tiendaApi.categorias, staleTime: 5 * 60_000 });
  const q = useQuery({ queryKey: ['inventario', 'lista', filtros], queryFn: () => inventarioApi.listar(filtros), placeholderData: keepPreviousData });

  const cols: Column<ExistenciaFila>[] = [
    { key: 'sku', header: 'SKU', cell: (f) => <code>{f.sku}</code> },
    { key: 'prod', header: 'Producto', cell: (f) => <>{f.nombreProducto}<br /><span className="muted small">{atributosTexto(f.atributos)}</span></> },
    { key: 'cat', header: 'Categoría', cell: (f) => f.nombreCategoria },
    { key: 'fis', header: 'Fisica', numeric: true, cell: (f) => f.existenciaFisica },
    { key: 'res', header: 'Reservada', numeric: true, cell: (f) => f.existenciaReservada },
    { key: 'disp', header: 'Disponible', numeric: true, cell: (f) => <Badge tone={f.existenciaDisponible <= 0 ? 'danger' : f.existenciaDisponible <= 10 ? 'warning' : 'success'}>{f.existenciaDisponible}</Badge> },
    { key: 'est', header: 'Estado', cell: (f) => (f.varianteActiva ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>) },
    { key: 'acc', header: '', cell: (f) => (
      <div className="row nowrap">
        <Button size="sm" variant="secondary" onClick={() => setModal({ fila: f, accion: 'kardex' })}>Kardex</Button>
        <Button size="sm" variant="secondary" onClick={() => setModal({ fila: f, accion: 'entrada' })}>Entrada</Button>
        <Button size="sm" variant="secondary" onClick={() => setModal({ fila: f, accion: 'ajuste' })}>Ajuste</Button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Inventario" subtitle="Existencias, kardex y movimientos. Disponible = fisica − reservada." />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <TextField label="Buscar" type="search" placeholder="SKU o producto" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <SelectField label="Categoria" value={url.get('idCategoria') ?? ''} onChange={(e) => url.set({ idCategoria: e.target.value })}>
              <option value="">Todas</option>{categorias.data?.map((c) => <option key={c.idCategoria} value={c.idCategoria}>{c.nombre}</option>)}
            </SelectField>
            <TextField label="Disponible menor o igual a" type="number" min={0} placeholder="Ej. 10" value={umbral} onChange={(e) => setUmbral(e.target.value)} hint="Para ver bajo stock o agotados (0)." />
          </div>
        </Card>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(f) => f.idVariante} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="Sin variantes con esos filtros" />
      </div>
      {modal && modal.accion !== 'kardex' && <MovimientoModal fila={modal.fila} tipo={modal.accion} onClose={() => setModal(null)} />}
      {modal && modal.accion === 'kardex' && <KardexModal fila={modal.fila} onClose={() => setModal(null)} />}
    </>
  );
}
