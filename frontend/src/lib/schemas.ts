import { z } from 'zod';

const texto = (campo: string, min = 1, max = 200) =>
  z.string().trim().min(min, `${campo} es obligatorio${min > 1 ? ` (minimo ${min} caracteres)` : ''}.`).max(max, `${campo}: maximo ${max} caracteres.`);

export const passwordSchema = z.string()
  .min(8, 'Minimo 8 caracteres.').max(72, 'Maximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'Debe incluir al menos una letra.').regex(/\d/, 'Debe incluir al menos un numero.');

export const loginSchema = z.object({
  correo: z.string().trim().min(1, 'El correo es obligatorio.').pipe(z.email('Correo invalido.')),
  contrasena: z.string().min(1, 'La contrasena es obligatoria.'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  nombre: texto('El nombre', 2, 150),
  correo: z.string().trim().min(1, 'El correo es obligatorio.').pipe(z.email('Correo invalido.')),
  contrasena: passwordSchema,
  confirmar: z.string().min(1, 'Confirme la contrasena.'),
}).refine((v) => v.contrasena === v.confirmar, { message: 'Las contrasenas no coinciden.', path: ['confirmar'] });
export type RegisterForm = z.infer<typeof registerSchema>;

export const direccionSchema = z.object({
  alias: texto('El alias', 2, 50),
  linea1: texto('La direccion', 5, 200),
  linea2: z.string().trim().max(200).optional().transform((v) => v || null),
  ciudad: texto('La ciudad', 2, 100),
  departamento: texto('El departamento', 2, 100),
  telefono: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Telefono invalido (7 a 20 digitos).'),
});
export type DireccionForm = z.input<typeof direccionSchema>;

const cantidadEntera = (min: number, max: number) => z.number({ error: 'Ingrese un numero.' }).int('Debe ser un numero entero.').min(min, `Minimo ${min}.`).max(max, `Maximo ${max}.`);

export const entradaSchema = z.object({ cantidad: cantidadEntera(1, 1_000_000), motivo: texto('El motivo', 3, 300) });
export const ajusteSchema = z.object({
  cantidad: cantidadEntera(-1_000_000, 1_000_000).refine((n) => n !== 0, 'La cantidad no puede ser cero.'),
  motivo: texto('El motivo', 3, 300),
});
export type MovimientoForm = z.infer<typeof ajusteSchema>;

export const cuponCodigoSchema = z.object({ codigo: z.string().trim().min(3, 'Minimo 3 caracteres.').max(30, 'Maximo 30 caracteres.') });
export const comentarioSchema = z.object({ comentario: z.string().trim().max(500, 'Maximo 500 caracteres.').optional() });
