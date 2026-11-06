/**Tipos que reflejan las respuestas del backend (docs/API.md)*/
export type Rol = 'Cliente' | 'Operador' | 'Administrador';

export interface Usuario { idUsuario: number; correo: string; nombre: string; rol: Rol }
export interface Sesion { accessToken: string; refreshToken: string; tokenType: 'Bearer'; usuario: Usuario }

export interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
export interface Page<T> { data: T[]; pagination: Pagination }

export type Atributos = Record<string, string>;

/*Tienda*/
export interface Categoria { idCategoria: number; nombre: string; descripcion: string | null; activa: boolean; totalProductos?: number }
export interface ProductoListado {
  idProducto: number; nombre: string; idCategoria: number; nombreCategoria: string; activo: boolean;
  precioMin: number | null; precioMax: number | null; existenciaDisponible: number; imagenUrl: string | null;
}
export interface VarianteTienda { idVariante: number; sku: string; atributos: Atributos; precio: number; existenciaDisponible: number; activa: boolean }
export interface ProductoDetalle {
  producto: { idProducto: number; idCategoria: number; nombreCategoria: string; nombre: string; descripcion: string | null; activo: boolean };
  variantes: VarianteTienda[];
  imagenes: { idImagenProducto: number; url: string; orden: number }[];
}

/*Carrito*/
export interface CarritoLinea {
  idVariante: number; sku: string; nombreProducto: string; atributos: Atributos; imagenUrl: string | null; precioUnitario: number;
  cantidad: number; descuentoLinea: number; subtotal: number; existenciaDisponible: number; disponible: boolean;
}
export interface Carrito {
  idCarrito: number | null; tokenInvitado: string | null; codigoCupon: string | null; cuponAviso: string | null;
  subtotal: number; descuento: number; total: number; montoIVA: number; totalUnidades: number; reservaExpira: string | null;
  lineas: CarritoLinea[];
}

/*Direcciones / checkout*/
export interface Direccion { idDireccion: number; alias: string; linea1: string; linea2: string | null; ciudad: string; departamento: string; telefono: string }
export type DireccionInput = Omit<Direccion, 'idDireccion'>;
export type MetodoPago = 'Tarjeta' | 'Transferencia' | 'Efectivo';
export interface Reserva { fechaExpira: string; minutosReserva: number; items: { sku: string; nombreProducto: string; cantidad: number }[] }

/*Pedidos*/
export interface PedidoResumen {
  idPedido: number; numeroPedido: string; idUsuario: number; nombreCliente: string; correoCliente: string;
  idEstadoPedido: number; estado: string; subtotal: number; descuento: number; total: number; fechaCreacion: string;
}
export interface PedidoLinea {
  idPedidoDetalle: number; idVariante: number; sku: string; nombreProducto: string; atributos: Atributos; precioUnitario: number;
  cantidad: number; descuentoLinea: number; subtotal: number; cantidadDevuelta: number; cantidadDevolvible: number;
}
export interface PedidoDetalle {
  pedido: PedidoResumen & { codigoCupon: string | null; direccionEnvio: string; telefonoContacto: string; montoIVA: number };
  lineas: PedidoLinea[];
  historial: { idPedidoHistorialEstado: number; estadoAnterior: string | null; estadoNuevo: string; nombreUsuario: string; fecha: string; comentario: string | null }[];
  pagos: { idPago: number; metodo: string; referencia: string; monto: number; estado: string; fecha: string }[];
  devoluciones: { idDevolucion: number; motivo: string; montoReembolsado: number; fecha: string; nombreUsuario: string }[];
}
export interface PagoResultado extends PedidoDetalle { repetida: boolean }
export interface Transicion { idEstadoOrigen: number; estadoOrigen: string; idEstadoDestino: number; estadoDestino: string }

/*Inventario*/
export interface ExistenciaFila {
  idVariante: number; sku: string; atributos: string; idProducto: number; nombreProducto: string; nombreCategoria: string;
  existenciaFisica: number; existenciaReservada: number; existenciaDisponible: number; varianteActiva: boolean;
}
export interface KardexFila {
  idKardex: number; tipoMovimiento: string; cantidad: number; existenciaResultante: number; motivo: string;
  idPedido: number | null; nombreUsuario: string; fecha: string;
}

/*Reportes*/
export interface MetaReporte { desde: string; hasta: string; agrupacion?: string }
export interface VentaPeriodo { periodo: string; pedidos: number; ventasBrutas: number; devoluciones: number; ventasNetas: number; ticketPromedio: number }
export interface Resumen {
  pedidos: number; ventasBrutas: number; devoluciones: number; ventasNetas: number; ticketPromedio: number; unidadesVendidas: number;
  clientesConCompra: number; carritosAbandonados: number; valorCarritosAbandonados: number; horasAbandono: number;
}
export interface VentaCategoria { idCategoria: number; categoria: string; unidades: number; ventasNetas: number; pedidos: number }
export interface TopProducto { idProducto: number; producto: string; categoria: string; unidades: number; ventasNetas: number }
export interface PedidosEstado { idEstadoPedido: number; estado: string; pedidos: number; monto: number }
export interface CarritoAbandonado {
  idCarrito: number; idUsuario: number | null; cliente: string; correo: string | null; unidades: number; valor: number;
  ultimaActividad: string; horasInactivo: number;
}
export interface CarritosAbandonadosRespuesta extends Page<CarritoAbandonado> { horas: number; valorTotal: number }
