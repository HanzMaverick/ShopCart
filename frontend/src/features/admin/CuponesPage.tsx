import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { adminApi } from '../../api/admin';
import type { Cupon } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, SelectField, TextField } from '../../components/ui/fields';
import { Alert, Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useUrlState, useUrlTextField } from '../../hooks/useUrlState';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { finDiaGuatemala, formatDate, formatQ, guatemalaDate, inicioDiaGuatemala } from '../../lib/format';
import { cuponSchema, type CuponForm } from '../../lib/schemas';

const CAMPOS = ['codigo', 'tipo', 'valor', 'montoMinimo', 'fechaInicio', 'fechaFin', 'limiteUsosTotal', 'limiteUsosPorCliente', 'idCategoria'] as const;

function CuponModal({ cupon, onClose, onSaved }: { cupon: Cupon | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const categorias = useQuery({ queryKey: ['admin', 'categorias'], queryFn: adminApi.categorias.listar });
  const { register, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm<CuponForm>({
    resolver: zodResolver(cuponSchema),
    defaultValues: cupon ? {
      codigo: cupon.codigo, tipo: cupon.tipo, valor: cupon.valor, montoMinimo: cupon.montoMinimo,
      fechaInicio: guatemalaDate(cupon.fechaInicio), fechaFin: guatemalaDate(cupon.fechaFin),
      limiteUsosTotal: cupon.limiteUsosTotal, limiteUsosPorCliente: cupon.limiteUsosPorCliente, idCategoria: cupon.idCategoria ? String(cupon.idCategoria) : '', activo: cupon.activo,
    } : { codigo: '', tipo: 'Porcentaje', valor: Number.NaN, montoMinimo: 0, fechaInicio: '', fechaFin: '', limiteUsosTotal: 100, limiteUsosPorCliente: 1, idCategoria: '', activo: true },
  });
  const tipo = watch('tipo');

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    // Vigencia por dias calendario en hora de Guatemala: inicio 00:00:00 y fin 23:59:59
    const body = {
      codigo: v.codigo.trim().toUpperCase(), tipo: v.tipo, valor: v.valor, montoMinimo: v.montoMinimo,
      fechaInicio: inicioDiaGuatemala(v.fechaInicio), fechaFin: finDiaGuatemala(v.fechaFin),
      limiteUsosTotal: v.limiteUsosTotal, limiteUsosPorCliente: v.limiteUsosPorCliente, idCategoria: v.idCategoria ? Number(v.idCategoria) : null,
    };
    try {
      if (cupon) await adminApi.cupones.actualizar(cupon.idCupon, { ...body, activo: v.activo }); else await adminApi.cupones.crear(body);
      toast.success('Cupon guardado');
      await onSaved(); onClose();
    } catch (e) { if (!applyServerErrors(e, setError, CAMPOS)) setFormError(errorMessage(e)); }
  });

  return (
    <Modal title={cupon ? `Editar cupon ${cupon.codigo}` : 'Nuevo cupon'} wide onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        {cupon && cupon.usosActuales > 0 && <Alert tone="info">Este cupón ya se uso {cupon.usosActuales} vez(veces); el limite total no puede ser menor.</Alert>}
        <div className="form-grid">
          <TextField label="Codigo" autoCapitalize="characters" error={errors.codigo?.message} {...register('codigo')} />
          <SelectField label="Tipo de descuento" error={errors.tipo?.message} {...register('tipo')}>
            <option value="Porcentaje">Porcentaje (%)</option><option value="MontoFijo">Monto fijo (Q)</option>
          </SelectField>
          <TextField label={tipo === 'Porcentaje' ? 'Valor (%)' : 'Valor (Q)'} type="number" step="0.01" min={0} error={errors.valor?.message} {...register('valor', { valueAsNumber: true })} />
          <TextField label="Compra minima (Q)" type="number" step="0.01" min={0} hint="Sobre el subtotal del carrito, IVA incluido." error={errors.montoMinimo?.message} {...register('montoMinimo', { valueAsNumber: true })} />
          <TextField label="Vigente desde" type="date" hint="Desde las 00:00 (hora de Guatemala)" error={errors.fechaInicio?.message} {...register('fechaInicio')} />
          <TextField label="Vigente hasta (inclusive)" type="date" hint="Hasta las 23:59 (hora de Guatemala)" error={errors.fechaFin?.message} {...register('fechaFin')} />
          <TextField label="Limite total de usos" type="number" min={1} error={errors.limiteUsosTotal?.message} {...register('limiteUsosTotal', { valueAsNumber: true })} />
          <TextField label="Limite de usos por cliente" type="number" min={1} error={errors.limiteUsosPorCliente?.message} {...register('limiteUsosPorCliente', { valueAsNumber: true })} />
          <SelectField label="Aplica a" hint="Todo el carrito o solo una categoria." error={errors.idCategoria?.message} {...register('idCategoria')}>
            <option value="">Todo el carrito</option>
            {categorias.data?.map((c) => <option key={c.idCategoria} value={c.idCategoria}>Solo {c.nombre}</option>)}
          </SelectField>
        </div>
        {cupon && <Checkbox label="Cupon activo" {...register('activo')} />}
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Guardar</Button></div>
      </form>
    </Modal>
  );
}

/** Solo informativo: la vigencia real la decide el servidor al validar el cupon*/
function vigenciaBadge(c: Cupon) {
  const ahora = Date.now();
  if (!c.activo) return <Badge>Inactivo</Badge>;
  if (new Date(c.fechaFin).getTime() < ahora) return <Badge tone="danger">Vencido</Badge>;
  if (new Date(c.fechaInicio).getTime() > ahora) return <Badge tone="info">Programado</Badge>;
  if (c.usosActuales >= c.limiteUsosTotal) return <Badge tone="warning">Agotado</Badge>;
  return <Badge tone="success">Vigente</Badge>;
}

export default function CuponesPage() {
  const url = useUrlState();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useUrlTextField(url, 'busqueda');
  const [editing, setEditing] = useState<Cupon | 'nuevo' | null>(null);
  const activoParam = url.get('activo');
  const filtros = { busqueda: url.get('busqueda'), activo: activoParam === 'true' ? true : activoParam === 'false' ? false : undefined, soloVigentes: url.getBool('vigentes'), page: url.page, pageSize: 15 };
  const q = useQuery({ queryKey: ['admin', 'cupones', filtros], queryFn: () => adminApi.cupones.listar(filtros), placeholderData: keepPreviousData });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin', 'cupones'] });

  const toggle = useMutation({
    mutationFn: (c: Cupon) => adminApi.cupones.cambiarEstado(c.idCupon, !c.activo),
    onSuccess: async (r) => { toast.success(r.activo ? 'Cupon activado' : 'Cupon desactivado'); await refrescar(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const cols: Column<Cupon>[] = [
    { key: 'c', header: 'Codigo', cell: (c) => <code><strong>{c.codigo}</strong></code> },
    { key: 'd', header: 'Descuento', cell: (c) => <>{c.tipo === 'Porcentaje' ? `${c.valor} %` : formatQ(c.valor)}<br /><span className="muted small">{c.nombreCategoria ? `Solo ${c.nombreCategoria}` : 'Todo el carrito'}{c.montoMinimo > 0 ? ` · min. ${formatQ(c.montoMinimo)}` : ''}</span></> },
    { key: 'v', header: 'Vigencia', cell: (c) => <>{formatDate(c.fechaInicio)} - {formatDate(c.fechaFin)}</> },
    { key: 'u', header: 'Usos', numeric: true, cell: (c) => <>{c.usosActuales} / {c.limiteUsosTotal}<br /><span className="muted small">{c.limiteUsosPorCliente} por cliente</span></> },
    { key: 'e', header: 'Estado', cell: vigenciaBadge },
    { key: 'a', header: '', cell: (c) => (
      <div className="row nowrap"><Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Editar</Button>
        <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.idCupon === c.idCupon} onClick={() => toggle.mutate(c)}>{c.activo ? 'Desactivar' : 'Activar'}</Button></div>) },
  ];

  return (
    <>
      <PageHeader title="Cupones" subtitle="Un solo cupon por pedido. Los limites se respetan aunque varios clientes lo usen a la vez." actions={<Button onClick={() => setEditing('nuevo')}>Nuevo cupon</Button>} />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <TextField label="Buscar codigo" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <SelectField label="Estado" value={activoParam ?? ''} onChange={(e) => url.set({ activo: e.target.value })}>
              <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
            </SelectField>
            <Checkbox label="Solo vigentes hoy" checked={url.getBool('vigentes') ?? false} onChange={(e) => url.set({ vigentes: e.target.checked })} />
          </div>
        </Card>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(c) => c.idCupon} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="No hay cupones con esos filtros" />
      </div>
      {editing && <CuponModal cupon={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} onSaved={refrescar} />}
    </>
  );
}
