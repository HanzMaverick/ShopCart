import { api } from './http';
import { cartToken } from './session';
import type {
  Carrito, CarritosAbandonadosRespuesta, Categoria, Direccion, DireccionInput, ExistenciaFila, KardexFila, MetaReporte, MetodoPago, Page,
  PagoResultado, PedidoDetalle, PedidoResumen, PedidosEstado, ProductoDetalle, ProductoListado, Reserva, Resumen, Sesion, TopProducto,
  Transicion, VentaCategoria, VentaPeriodo,
} from './types';

/*Auth*/
export const authApi = {
  login: (correo: string, contrasena: string) => api<Sesion>('/auth/login', { method: 'POST', body: { correo, contrasena }, auth: false }),
  register: (b: { nombre: string; correo: string; contrasena: string }) => api<Sesion>('/auth/register', { method: 'POST', body: b, auth: false }),
  logout: (refreshToken: string) => api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
};

/*Tienda*/
export interface FiltrosTienda {
  texto?: string; idCategoria?: number; precioMin?: number; precioMax?: number; soloDisponibles?: boolean;
  ordenarPor?: string; direccion?: string; page?: number; pageSize?: number;
}
export const tiendaApi = {
  categorias: () => api<Categoria[]>('/tienda/categorias'),
  productos: (f: FiltrosTienda) => api<Page<ProductoListado>>('/tienda/productos', { query: { ...f } }),
  producto: (id: number) => api<ProductoDetalle>(`/tienda/productos/${id}`),
};

/*Carrito (invitado o cliente)*/
function recordar(c: Carrito): Carrito {
  if (c.tokenInvitado) cartToken.set(c.tokenInvitado);     // el invitado conserva su carrito entre visitas
  return c;
}
export const carritoApi = {
  obtener: () => api<Carrito>('/carrito').then(recordar),
  agregar: (idVariante: number, cantidad: number) => api<Carrito>('/carrito/items', { method: 'POST', body: { idVariante, cantidad } }).then(recordar),
  cambiarCantidad: (idVariante: number, cantidad: number) => api<Carrito>(`/carrito/items/${idVariante}`, { method: 'PATCH', body: { cantidad } }).then(recordar),
  quitar: (idVariante: number) => api<Carrito>(`/carrito/items/${idVariante}`, { method: 'DELETE' }).then(recordar),
  vaciar: () => api<Carrito>('/carrito', { method: 'DELETE' }).then(recordar),
  aplicarCupon: (codigo: string) => api<Carrito>('/carrito/cupon', { method: 'POST', body: { codigo } }).then(recordar),
  quitarCupon: () => api<Carrito>('/carrito/cupon', { method: 'DELETE' }).then(recordar),
  fusionar: (tokenInvitado: string) => api<Carrito>('/carrito/fusionar', { method: 'POST', body: { tokenInvitado } }),
};

/*Direcciones y checkout*/
export const direccionesApi = {
  listar: () => api<Direccion[]>('/direcciones'),
  crear: (d: DireccionInput) => api<Direccion>('/direcciones', { method: 'POST', body: d }),
  actualizar: (id: number, d: DireccionInput) => api<Direccion>(`/direcciones/${id}`, { method: 'PUT', body: d }),
  eliminar: (id: number) => api<void>(`/direcciones/${id}`, { method: 'DELETE' }),
};

export const checkoutApi = {
  iniciar: () => api<Reserva>('/checkout/iniciar', { method: 'POST' }),
  /** `clave` = Idempotency-Key: el mismo valor en reintentos garantiza un solo pedido y un solo cobro. */
  pagar: (clave: string, b: { idDireccion: number; metodoPago: MetodoPago; totalEsperado: number }) =>
    api<PagoResultado>('/checkout/pagar', { method: 'POST', body: b, headers: { 'Idempotency-Key': clave } }),
};

/*Pedidos*/
export interface FiltrosPedidos {
  idEstadoPedido?: number; cliente?: string; desde?: string; hasta?: string; ordenarPor?: string; direccion?: string; page?: number; pageSize?: number;
}
export const pedidosApi = {
  mis: (f: FiltrosPedidos) => api<Page<PedidoResumen>>('/pedidos/mis', { query: { ...f } }),
  todos: (f: FiltrosPedidos) => api<Page<PedidoResumen>>('/pedidos', { query: { ...f } }),
  detalle: (id: number) => api<PedidoDetalle>(`/pedidos/${id}`),
  cancelar: (id: number, comentario?: string) => api<{ idPedido: number }>(`/pedidos/${id}/cancelar`, { method: 'POST', body: { comentario } }),
  cambiarEstado: (id: number, idEstadoNuevo: number, comentario?: string) =>
    api<{ idPedido: number; estado: string }>(`/pedidos/${id}/estado`, { method: 'PATCH', body: { idEstadoNuevo, comentario } }),
  transiciones: () => api<Transicion[]>('/pedidos/transiciones'),
  devolver: (id: number, motivo: string, lineas: { idPedidoDetalle: number; cantidad: number }[]) =>
    api<{ idDevolucion: number; montoReembolsado: number; estado: string }>(`/pedidos/${id}/devoluciones`, { method: 'POST', body: { motivo, lineas } }),
};

/*Inventario*/
export interface FiltrosInventario { texto?: string; idCategoria?: number; umbralBajo?: number; page?: number; pageSize?: number }
export const inventarioApi = {
  listar: (f: FiltrosInventario) => api<Page<ExistenciaFila>>('/inventario', { query: { ...f } }),
  kardex: (idVariante: number, f: { tipo?: string; page?: number; pageSize?: number }) =>
    api<Page<KardexFila>>(`/inventario/variantes/${idVariante}/kardex`, { query: { ...f } }),
  entrada: (idVariante: number, cantidad: number, motivo: string) =>
    api<{ existenciaFisica: number }>(`/inventario/variantes/${idVariante}/entradas`, { method: 'POST', body: { cantidad, motivo } }),
  ajuste: (idVariante: number, cantidad: number, motivo: string) =>
    api<{ existenciaFisica: number }>(`/inventario/variantes/${idVariante}/ajustes`, { method: 'POST', body: { cantidad, motivo } }),
};

/*Reportes (Administrador)*/
export interface Rango { desde?: string; hasta?: string }
export const reportesApi = {
  resumen: (r: Rango, horasAbandono?: number) => api<{ meta: MetaReporte; resumen: Resumen }>('/reportes/resumen', { query: { ...r, horasAbandono } }),
  ventas: (r: Rango, agrupacion: string) => api<{ meta: MetaReporte; data: VentaPeriodo[] }>('/reportes/ventas', { query: { ...r, agrupacion } }),
  categorias: (r: Rango) => api<{ meta: MetaReporte; data: VentaCategoria[] }>('/reportes/categorias', { query: { ...r } }),
  top: (r: Rango, top = 10) => api<{ meta: MetaReporte; data: TopProducto[] }>('/reportes/top-productos', { query: { ...r, top } }),
  estados: (r: Rango) => api<{ meta: MetaReporte; data: PedidosEstado[] }>('/reportes/pedidos-por-estado', { query: { ...r } }),
  abandonados: (horas: number, page: number, pageSize: number) =>
    api<CarritosAbandonadosRespuesta>('/reportes/carritos-abandonados', { query: { horas, page, pageSize } }),
};
