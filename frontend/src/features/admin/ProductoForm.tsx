import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { adminApi } from '../../api/admin';
import type { ProductoInput } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField, TextareaField } from '../../components/ui/fields';
import { Alert } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { productoSchema } from '../../lib/schemas';

type FormIn = z.input<typeof productoSchema>;
type FormOut = z.output<typeof productoSchema>;

interface Props { initial?: { idCategoria: number; nombre: string; descripcion: string | null }; submitLabel: string; onSubmit: (v: ProductoInput) => Promise<void>; onCancel?: () => void }

/** Datos generales de un producto (alta y edicion). */
export function ProductoForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const categorias = useQuery({ queryKey: ['admin', 'categorias'], queryFn: adminApi.categorias.listar });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(productoSchema),
    defaultValues: { idCategoria: initial?.idCategoria ?? (Number.NaN), nombre: initial?.nombre ?? '', descripcion: initial?.descripcion ?? '' },
  });
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await onSubmit(v); } catch (e) { if (!applyServerErrors(e, setError, ['idCategoria', 'nombre', 'descripcion'])) setFormError(errorMessage(e)); }
  });
  const activas = categorias.data?.filter((c) => c.activa || c.idCategoria === initial?.idCategoria) ?? [];

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      {categorias.isError && <Alert tone="warning">No se pudieron cargar las categorias. <Button size="sm" variant="ghost" onClick={() => void categorias.refetch()}>Reintentar</Button></Alert>}
      <SelectField label="Categoría" error={errors.idCategoria?.message} {...register('idCategoria', { valueAsNumber: true })}>
        <option value="">Seleccione...</option>
        {activas.map((c) => <option key={c.idCategoria} value={c.idCategoria}>{c.nombre}{c.activa ? '' : ' (inactiva)'}</option>)}
      </SelectField>
      <TextField label="Nombre" error={errors.nombre?.message} {...register('nombre')} />
      <TextareaField label="Descripción (opcional)" error={errors.descripcion?.message} {...register('descripcion')} />
      <div className="modal-actions">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>}
        <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
