import { z } from 'zod';

export const idSchema = z.coerce.number().int().positive();
export const idParams = z.object({ id: idSchema });

/** "true"/"false" en query string -> boolean*/
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const passwordSchema = z.string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres.')
  .max(72, 'La contrasena no puede exceder 72 caracteres.')
  .regex(/[A-Za-z]/, 'La contrasena debe incluir al menos una letra.')
  .regex(/\d/, 'La contrasena debe incluir al menos un numero.');

export const emailSchema = z.string().trim().toLowerCase().email('Correo invalido.').max(256);
export const moneySchema = z.number().positive().max(9_999_999_999)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Maximo 2 decimales.');
export const atributosSchema = z.record(z.string().min(1).max(30), z.string().min(1).max(60))
  .refine((o) => JSON.stringify(o).length <= 500, 'Atributos demasiado largos.');
