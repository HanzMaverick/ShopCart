import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import type { DireccionInput } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { Alert } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { direccionSchema } from '../../lib/schemas';
import guatemala from '../../data/guatemala.json';

type FormIn = z.input<typeof direccionSchema>;
type FormOut = z.output<typeof direccionSchema>;

interface Props {
  initial?: DireccionInput;
  submitLabel?: string;
  onSubmit: (d: DireccionInput) => Promise<void>;
  onCancel?: () => void;
}

// Se conservan nombres de municipios/departamentos como valores enviados a la API.
// Los códigos oficiales quedan disponibles en guatemala.json para futuras mejoras.
const departamentos = [...guatemala].sort((a, b) => a.text.localeCompare(b.text, 'es'));


/** Formulario reutilizable de dirección (checkout y Mis direcciones). */
export function DireccionForm({ initial, submitLabel = 'Guardar dirección', onSubmit, onCancel }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setValue, control, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(direccionSchema),
    defaultValues: initial
      ? {
          ...initial,
          linea2: initial.linea2 ?? '',
        }
      : { alias: '', linea1: '', linea2: '', ciudad: '', departamento: '', telefono: '' },
  });

  const departamento = useWatch({ control, name: 'departamento' }) ?? '';
  const departamentoSeleccionado = departamentos.find((d) => d.text === departamento);
  const municipios = [...(departamentoSeleccionado?.children ?? [])].sort((a, b) => a.text.localeCompare(b.text, 'es'));

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    // Además del esquema existente, comprobamos la pertenencia al catálogo.
    const dep = departamentos.find((d) => d.text === v.departamento);
    if (!dep) {
      setError('departamento', { type: 'manual', message: 'Seleccione un departamento válido.' });
      return;
    }
    if (!dep.children.some((m) => m.text === v.ciudad)) {
      setError('ciudad', { type: 'manual', message: 'Seleccione un municipio válido.' });
      return;
    }
    try {
      await onSubmit(v);
    } catch (e) {
      if (!applyServerErrors(e, setError, ['alias', 'linea1', 'linea2', 'ciudad', 'departamento', 'telefono'])) {
        setFormError(errorMessage(e));
      }
    }
  });

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="form-grid">
        <TextField label="Alias" placeholder="Casa, Oficina..." error={errors.alias?.message} {...register('alias')} />
        <TextField label="Teléfono" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      </div>
      <TextField label="Dirección" error={errors.linea1?.message} {...register('linea1')} />
      <TextField label="Referencia (opcional)" error={errors.linea2?.message} {...register('linea2')} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="direccion-departamento">Departamento</label>
          <select
            id="direccion-departamento"
            className="select"
            aria-invalid={!!errors.departamento}
            {...register('departamento', {
              onChange: () => {
                // Al cambiar el departamento, el municipio anterior deja de ser válido.
                setValue('ciudad', '', { shouldValidate: false, shouldDirty: true });
              },
            })}
          >
            <option value="">Seleccione un departamento</option>
            {departamentos.map((d) => (
              <option key={d.value} value={d.text}>{d.text}</option>
            ))}
          </select>
          {errors.departamento && <span className="field-error" role="alert">{errors.departamento.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="direccion-municipio">Municipio</label>
          <select
            id="direccion-municipio"
            className="select"
            disabled={!departamentoSeleccionado}
            aria-invalid={!!errors.ciudad}
            {...register('ciudad')}
          >
            <option value="">Seleccione un municipio</option>
            {municipios.map((m) => (
              <option key={m.value} value={m.text}>{m.text}</option>
            ))}
          </select>
          {errors.ciudad && <span className="field-error" role="alert">{errors.ciudad.message}</span>}
        </div>
      </div>
      <div className="modal-actions">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>}
        <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
