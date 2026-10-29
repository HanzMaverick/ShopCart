import { z } from 'zod';
import { atributosSchema, boolQuery, emailSchema, idSchema, moneySchema, passwordSchema } from './common';
import { paginationSchema } from '../utils/pagination';

/*  Auth*/
export const registerBody = z.object({ correo: emailSchema, contrasena: passwordSchema, nombre: z.string().trim().min(2).max(150) });
export const loginBody = z.object({ correo: emailSchema, contrasena: z.string().min(1).max(72) });
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

/* Usuarios*/
export const crearUsuarioBody = registerBody.extend({ idRol: z.number().int().min(1).max(3) });
export const estadoUsuarioBody = z.object({ activo: z.boolean() });
export const listarUsuariosQuery = paginationSchema.extend({
  busqueda: z.string().trim().max(100).optional(),
  idRol: z.coerce.number().int().min(1).max(3).optional(),
  activo: boolQuery.optional(),
});

/* Catalogo*/
export const categoriaBody = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(500).nullish(),
  activa: z.boolean().default(true),
});
export const productoBody = z.object({
  idCategoria: idSchema,
  nombre: z.string().trim().min(2).max(200),
  descripcion: z.string().trim().max(2000).nullish(),
});
export const imagenBody = z.object({ url: z.string().url().max(500), orden: z.number().int().min(0).max(255).optional() });

export const buscarProductosQuery = paginationSchema.extend({
  texto: z.string().trim().max(100).optional(),
  idCategoria: idSchema.optional(),
  precioMin: z.coerce.number().min(0).optional(),
  precioMax: z.coerce.number().min(0).optional(),
  soloDisponibles: boolQuery.optional(),
  ordenarPor: z.enum(['Nombre', 'Precio', 'Recientes']).optional(),
  direccion: z.enum(['ASC', 'DESC']).optional(),
}).refine((q) => q.precioMin === undefined || q.precioMax === undefined || q.precioMin <= q.precioMax,
  { message: 'precioMin no puede ser mayor que precioMax.', path: ['precioMin'] });

export const varianteCrearBody = z.object({
  sku: z.string().trim().min(2).max(50),
  atributos: atributosSchema.default({}),
  precio: moneySchema,
  existenciaInicial: z.number().int().min(0).max(1_000_000).default(0),
});
export const varianteActualizarBody = z.object({ sku: z.string().trim().min(2).max(50), atributos: atributosSchema });
export const precioBody = z.object({ precio: moneySchema });
export const estadoVarianteBody = z.object({ activa: z.boolean() });
export const estadoProductoBody = z.object({ activo: z.boolean() });

/* Inventario */
export const listarInventarioQuery = paginationSchema.extend({
  texto: z.string().trim().max(100).optional(),
  idCategoria: idSchema.optional(),
  umbralBajo: z.coerce.number().int().min(0).optional(),
});
export const kardexQuery = paginationSchema.extend({
  tipo: z.enum(['Entrada', 'Salida', 'Ajuste', 'Devolucion']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});
export const entradaBody = z.object({ cantidad: z.number().int().positive().max(1_000_000), motivo: z.string().trim().min(3).max(300) });
export const ajusteBody = z.object({
  cantidad: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'La cantidad no puede ser cero.'),
  motivo: z.string().trim().min(3, 'El motivo es obligatorio.').max(300),
});

/* Bitacora*/
export const bitacoraQuery = paginationSchema.extend({
  modulo: z.enum(['Catalogo', 'Precios', 'Inventario', 'Cupones', 'Pedidos', 'Usuarios']).optional(),
});

/* Carrito*/
export const itemBody = z.object({ idVariante: idSchema, cantidad: z.number().int().min(1).max(10000) });
export const cantidadBody = z.object({ cantidad: z.number().int().min(1).max(10000) });
export const idVarianteParams = z.object({ idVariante: idSchema });
export const cuponCodigoBody = z.object({ codigo: z.string().trim().min(3).max(30) });
export const fusionarBody = z.object({ tokenInvitado: z.string().uuid() });

/* Direcciones*/
export const direccionBody = z.object({
  alias: z.string().trim().min(2).max(50),
  linea1: z.string().trim().min(5).max(200),
  linea2: z.string().trim().max(200).nullish().transform((v) => v || null),
  ciudad: z.string().trim().min(2).max(100),
  departamento: z.string().trim().min(2).max(100),
  telefono: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Telefono invalido.'),
});

/* Checkout*/
export const idempotencyHeader = z.string().uuid('El header Idempotency-Key debe ser un UUID.');
export const pagarBody = z.object({
  idDireccion: idSchema,
  metodoPago: z.enum(['Tarjeta', 'Transferencia', 'Efectivo']),
  totalEsperado: z.number().min(0).max(9_999_999_999).optional(),   // el total que vio el cliente
});

/* Cupones */
const cuponCampos = z.object({
  codigo: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, 'Codigo: 3 a 30 caracteres (letras, numeros, - y _).'),
  tipo: z.enum(['Porcentaje', 'MontoFijo']),
  valor: moneySchema,
  montoMinimo: z.number().min(0).max(9_999_999_999).default(0),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date(),
  limiteUsosTotal: z.number().int().min(1).max(1_000_000),
  limiteUsosPorCliente: z.number().int().min(1).max(1000),
  idCategoria: idSchema.nullish(),
});
type CuponShape = z.infer<typeof cuponCampos>;
const reglasCupon = (c: CuponShape, ctx: z.RefinementCtx) => {
  if (c.tipo === 'Porcentaje' && c.valor > 100)
    ctx.addIssue({ code: 'custom', message: 'Un porcentaje no puede exceder 100.', path: ['valor'] });
  if (c.fechaFin <= c.fechaInicio)
    ctx.addIssue({ code: 'custom', message: 'fechaFin debe ser posterior a fechaInicio.', path: ['fechaFin'] });
  if (c.limiteUsosPorCliente > c.limiteUsosTotal)
    ctx.addIssue({ code: 'custom', message: 'El limite por cliente no puede superar el limite total.', path: ['limiteUsosPorCliente'] });
};
export const cuponCrearBody = cuponCampos.superRefine(reglasCupon);
export const cuponActualizarBody = cuponCampos.extend({ activo: z.boolean() }).superRefine(reglasCupon);
export const estadoCuponBody = z.object({ activo: z.boolean() });
export const listarCuponesQuery = paginationSchema.extend({
  busqueda: z.string().trim().max(30).optional(),
  activo: boolQuery.optional(),
  soloVigentes: boolQuery.optional(),
});

/* Pedidos*/
export const listarPedidosQuery = paginationSchema.extend({
  idEstadoPedido: z.coerce.number().int().min(1).max(7).optional(),
  cliente: z.string().trim().max(100).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),           // exclusivo
  ordenarPor: z.enum(['Fecha', 'Total', 'Estado', 'Cliente']).optional(),
  direccion: z.enum(['ASC', 'DESC']).optional(),
});
export const estadoPedidoBody = z.object({ idEstadoNuevo: z.number().int().min(1).max(5), comentario: z.string().trim().max(500).optional() });
export const cancelarBody = z.object({ comentario: z.string().trim().max(500).optional() });
export const devolucionBody = z.object({
  motivo: z.string().trim().min(3).max(500),
  lineas: z.array(z.object({ idPedidoDetalle: idSchema, cantidad: z.number().int().min(1).max(10000) })).min(1).max(100),
});
