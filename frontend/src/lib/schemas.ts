import { z } from 'zod';

const texto = (campo: string, min = 1, max = 200) =>
  z.string().trim().min(min, `${campo} es obligatorio${min > 1 ? ` (minimo ${min} caracteres)` : ''}.`).max(max, `${campo}: maximo ${max} caracteres.`);

export const passwordSchema = z.string()
  .min(8, 'Minimo 8 caracteres.').max(72, 'Maximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'Debe incluir al menos una letra.').regex(/\d/, 'Debe incluir al menos un número.');

export const loginSchema = z.object({
  correo: z.string().trim().min(1, 'El correo es obligatorio.').pipe(z.email('Correo invalido.')),
  contrasena: z.string().min(1, 'La contraseña es obligatoria.'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  nombre: texto('El nombre', 2, 150),
  correo: z.string().trim().min(1, 'El correo es obligatorio.').pipe(z.email('Correo invalido.')),
  contrasena: passwordSchema,
  confirmar: z.string().min(1, 'Confirme la contraseña.'),
}).refine((v) => v.contrasena === v.confirmar, { message: 'Las contraseñas no coinciden.', path: ['confirmar'] });
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

/*Administracion*/
const monto = z.number({ error: 'Ingrese un monto.' }).positive('Debe ser mayor a cero.').max(9_999_999_999, 'Monto demasiado alto.')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Maximo 2 decimales.');
const entero = (min: number, max: number) => z.number({ error: 'Ingrese un numero.' }).int('Debe ser un numero entero.').min(min, `Minimo ${min}.`).max(max, `Maximo ${max.toLocaleString('es-GT')}.`);
const opcional = (max: number) => z.string().trim().max(max, `Maximo ${max} caracteres.`).optional().transform((v) => v || null);

export const categoriaSchema = z.object({ nombre: texto('El nombre', 2, 100), descripcion: opcional(500), activa: z.boolean() });

export const productoSchema = z.object({
  idCategoria: z.number({ error: 'Seleccione una categoria.' }).int().positive('Seleccione una categoria.'),
  nombre: texto('El nombre', 2, 200),
  descripcion: opcional(2000),
});

const atributosArray = z.array(z.object({ clave: z.string().trim().max(30, 'Maximo 30 caracteres.'), valor: z.string().trim().max(60, 'Maximo 60 caracteres.') }))
  .max(6, 'Maximo 6 atributos.')
  .superRefine((arr, ctx) => {
    const vistos = new Set<string>();
    arr.forEach((p, i) => {
      if (!p.clave && !p.valor) return;
      if (!p.clave) ctx.addIssue({ code: 'custom', path: [i, 'clave'], message: 'Ingrese el nombre del atributo.' });
      else if (!p.valor) ctx.addIssue({ code: 'custom', path: [i, 'valor'], message: 'Ingrese el valor.' });
      else if (vistos.has(p.clave.toLowerCase())) ctx.addIssue({ code: 'custom', path: [i, 'clave'], message: 'Atributo repetido.' });
      vistos.add(p.clave.toLowerCase());
    });
  });
export const varianteCrearSchema = z.object({ sku: texto('El SKU', 2, 50), precio: monto, existenciaInicial: entero(0, 1_000_000), atributos: atributosArray });
export const varianteEditarSchema = z.object({ sku: texto('El SKU', 2, 50), atributos: atributosArray });
export const precioSchema = z.object({ precio: monto });
export const imagenSchema = z.object({ url: z.string().trim().url('URL invalida (incluya https://).').max(500, 'Maximo 500 caracteres.'), orden: entero(0, 255) });
export type VarianteCrearForm = z.input<typeof varianteCrearSchema>;
export type VarianteEditarForm = z.input<typeof varianteEditarSchema>;

/**Convierte los pares clave/valor del formulario al objeto que espera el API (se ignoran las filas vacias)*/
export const paresAObjeto = (pares: { clave: string; valor: string }[]): Record<string, string> =>
  Object.fromEntries(pares.filter((p) => p.clave.trim() && p.valor.trim()).map((p) => [p.clave.trim(), p.valor.trim()]));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione una fecha.');
export const cuponSchema = z.object({
  codigo: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, 'De 3 a 30 caracteres: letras, numeros, - y _.'),
  tipo: z.enum(['Porcentaje', 'MontoFijo']),
  valor: monto,
  montoMinimo: z.number({ error: 'Ingrese un monto (0 si no aplica).' }).min(0, 'No puede ser negativo.').max(9_999_999_999, 'Monto demasiado alto.'),
  fechaInicio: ymd,
  fechaFin: ymd,
  limiteUsosTotal: entero(1, 1_000_000),
  limiteUsosPorCliente: entero(1, 1000),
  idCategoria: z.string(),
  activo: z.boolean(),
}).superRefine((c, ctx) => {
  if (c.tipo === 'Porcentaje' && c.valor > 100) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Un porcentaje no puede exceder 100.' });
  if (c.fechaInicio && c.fechaFin && c.fechaFin < c.fechaInicio) ctx.addIssue({ code: 'custom', path: ['fechaFin'], message: 'Debe ser igual o posterior al inicio.' });
  if (c.limiteUsosPorCliente > c.limiteUsosTotal) ctx.addIssue({ code: 'custom', path: ['limiteUsosPorCliente'], message: 'No puede superar el limite total.' });
});
export type CuponForm = z.input<typeof cuponSchema>;

export const usuarioSchema = z.object({
  idRol: z.number({ error: 'Seleccione un rol.' }).int().min(1, 'Seleccione un rol.').max(3),
  nombre: texto('El nombre', 2, 150),
  correo: z.string().trim().min(1, 'El correo es obligatorio.').pipe(z.email('Correo invalido.')),
  contrasena: passwordSchema,
});
export type UsuarioForm = z.input<typeof usuarioSchema>;
