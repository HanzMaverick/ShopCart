import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { adminApi } from '../../api/admin';
import type { Categoria } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { TextField, TextareaField } from '../../components/ui/fields';
import { Alert, Badge, PageHeader } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { categoriaSchema } from '../../lib/schemas';

type FormIn = z.input<typeof categoriaSchema>;
type FormOut = z.output<typeof categoriaSchema>;

function CategoriaModal({ categoria, onClose, onSaved }: { categoria: Categoria | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nombre: categoria?.nombre ?? '', descripcion: categoria?.descripcion ?? '', activa: categoria?.activa ?? true },
  });
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (categoria) await adminApi.categorias.actualizar(categoria.idCategoria, v); else await adminApi.categorias.crear(v);
      toast.success('Categoría guardada');
      await onSaved(); onClose();
    } catch (e) { if (!applyServerErrors(e, setError, ['nombre', 'descripcion'])) setFormError(errorMessage(e)); }
  });
  return (
    <Modal title={categoria ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Nombre" error={errors.nombre?.message} {...register('nombre')} />
        <TextareaField label="Descripción (opcional)" error={errors.descripcion?.message} {...register('descripcion')} />
        <label className="check"><input type="checkbox" {...register('activa')} /> Activa (visible en la tienda)</label>
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Guardar</Button></div>
      </form>
    </Modal>
  );
}

export default function CategoriasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'categorias'], queryFn: adminApi.categorias.listar });
  const [editing, setEditing] = useState<Categoria | 'nueva' | null>(null);
  const [deleting, setDeleting] = useState<Categoria | null>(null);
  const refrescar = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'categorias'] }), qc.invalidateQueries({ queryKey: ['tienda'] })]);

  const eliminar = useMutation({
    mutationFn: (id: number) => adminApi.categorias.eliminar(id),
    onSuccess: async () => { toast.success('Categoria eliminada'); setDeleting(null); await refrescar(); },
    onError: (e) => { toast.error(errorMessage(e)); setDeleting(null); },
  });

  const cols: Column<Categoria>[] = [
    { key: 'n', header: 'Nombre', cell: (c) => <strong>{c.nombre}</strong> },
    { key: 'd', header: 'Descripción', cell: (c) => c.descripcion ?? <span className="muted">-</span> },
    { key: 'p', header: 'Productos', numeric: true, cell: (c) => c.totalProductos ?? 0 },
    { key: 'e', header: 'Estado', cell: (c) => (c.activa ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>) },
    { key: 'a', header: '', cell: (c) => (
      <div className="row nowrap"><Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>Eliminar</Button></div>) },
  ];

  return (
    <>
      <PageHeader title="Categorias" subtitle="Una categoría con productos o cupones no se elimina: desactivela." actions={<Button onClick={() => setEditing('nueva')}>Nueva categoría</Button>} />
      <DataTable columns={cols} rows={q.data} rowKey={(c) => c.idCategoria} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()} emptyTitle="Aun no hay categorias" />
      {editing && <CategoriaModal categoria={editing === 'nueva' ? null : editing} onClose={() => setEditing(null)} onSaved={refrescar} />}
      {deleting && (
        <ConfirmDialog title="Eliminar categoria" danger confirmLabel="Eliminar" loading={eliminar.isPending}
          message={<>¿Eliminar <strong>{deleting.nombre}</strong>? Si tiene productos o cupones asociados el sistema lo impedira.</>}
          onConfirm={() => eliminar.mutate(deleting.idCategoria)} onCancel={() => setDeleting(null)} />
      )}
    </>
  );
}
