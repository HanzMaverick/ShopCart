import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import type { DireccionInput } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { Alert } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { direccionSchema } from '../../lib/schemas';

type FormIn = z.input<typeof direccionSchema>;
type FormOut = z.output<typeof direccionSchema>;

interface Props { initial?: DireccionInput; submitLabel?: string; onSubmit: (d: DireccionInput) => Promise<void>; onCancel?: () => void }

/** Formulario reutilizable de direccion (checkout y "Mis direcciones"). */
export function DireccionForm({ initial, submitLabel = 'Guardar direccion', onSubmit, onCancel }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(direccionSchema),
    defaultValues: initial ? { ...initial, linea2: initial.linea2 ?? '' } : { alias: '', linea1: '', linea2: '', ciudad: 'Guatemala', departamento: 'Guatemala', telefono: '' },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await onSubmit(v); } catch (e) {
      if (!applyServerErrors(e, setError, ['alias', 'linea1', 'linea2', 'ciudad', 'departamento', 'telefono'])) setFormError(errorMessage(e));
    }
  });

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="form-grid">
        <TextField label="Alias" placeholder="Casa, Oficina..." error={errors.alias?.message} {...register('alias')} />
        <TextField label="Telefono" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      </div>
      <TextField label="Direccion" error={errors.linea1?.message} {...register('linea1')} />
      <TextField label="Referencia (opcional)" error={errors.linea2?.message} {...register('linea2')} />
      <div className="form-grid">
        <TextField label="Ciudad" error={errors.ciudad?.message} {...register('ciudad')} />
        <TextField label="Departamento" error={errors.departamento?.message} {...register('departamento')} />
      </div>
      <div className="modal-actions">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>}
        <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
