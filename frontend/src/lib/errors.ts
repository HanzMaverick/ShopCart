import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../api/http';

export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Ocurrio un error inesperado.';

/** Traslada los errores de validacion del servidor (422 con details) a los campos del formulario. Devuelve true si mapeo alguno. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  if (!(err instanceof ApiError) || !err.details?.length) return false;
  let mapped = false;
  for (const d of err.details) {
    const campo = d.campo.split('.')[0] ?? '';
    if (fields.includes(campo)) { setError(campo as Path<T>, { type: 'server', message: d.mensaje }); mapped = true; }
  }
  return mapped;
}
