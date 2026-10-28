import { execSp, P, parseJson, type Row } from '../db/sp';

export interface ReservaResultado {
  fechaExpira: Date; minutosReserva: number; items: { sku: string; nombreProducto: string; cantidad: number }[];
}
export interface PedidoCreado { idPedido: number; numeroPedido: string; repetida: boolean }
export interface PedidoListado {
  idPedido: number; numeroPedido: string; idUsuario: number; nombreCliente: string; correoCliente: string;
  idEstadoPedido: number; estado: string; subtotal: number; descuento: number; total: number; fechaCreacion: Date; totalRegistros: number;
}
export interface PedidoDetalle {
  pedido: Row; lineas: Row[]; historial: Row[]; pagos: Row[]; devoluciones: Row[];
}

export const pedidosRepository = {
  /* ---- Checkout ---- */
  async reservar(idUsuario: number, minutos?: number): Promise<ReservaResultado> {
    const { sets } = await execSp('SP_Inventario_ReservarExistencia', [P.int('IDUsuario', idUsuario), P.int('MinutosReserva', minutos)]);
    const cab = sets[0]![0] as unknown as { fechaExpira: Date; minutosReserva: number };
    return { ...cab, items: (sets[1] ?? []) as unknown as ReservaResultado['items'] };
  },

  async crear(a: { idUsuario: number; clave: string; hash: string; idDireccion: number; metodoPago: string; totalEsperado?: number }) {
    return (await execSp<PedidoCreado>('SP_Pedidos_CrearPedido', [
      P.int('IDUsuario', a.idUsuario), P.guid('ClaveIdempotencia', a.clave), P.char('HashSolicitud', 64, a.hash),
      P.int('IDDireccion', a.idDireccion), P.vstr('MetodoPago', 20, a.metodoPago), P.money('TotalEsperado', a.totalEsperado)])).rows[0]!;
  },

  /** @param idUsuarioDueno  con valor: solo si el pedido es de ese usuario (si no, 404). Sin valor: vista de personal. */
  async detalle(idPedido: number, idUsuarioDueno?: number): Promise<PedidoDetalle> {
    const { sets } = await execSp('SP_Pedidos_ObtenerDetalle', [P.int('IDPedido', idPedido), P.int('IDUsuarioDueno', idUsuarioDueno)]);
    return {
      pedido: sets[0]![0]!,
      lineas: (sets[1] ?? []).map((l) => ({ ...l, atributos: parseJson(l['atributos']) })),
      historial: sets[2] ?? [], pagos: sets[3] ?? [], devoluciones: sets[4] ?? [],
    };
  },

  async listar(f: { idUsuarioDueno?: number; idEstadoPedido?: number; cliente?: string; desde?: Date; hasta?: Date;
                    ordenarPor?: string; direccion?: string; page: number; pageSize: number }) {
    return (await execSp<PedidoListado>('SP_Pedidos_Listar', [
      P.int('IDUsuarioDueno', f.idUsuarioDueno), P.tiny('IDEstadoPedido', f.idEstadoPedido), P.str('Cliente', 100, f.cliente),
      P.date('FechaDesde', f.desde), P.date('FechaHasta', f.hasta), P.vstr('OrdenarPor', 10, f.ordenarPor), P.vstr('Direccion', 4, f.direccion),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)])).rows;
  },

  async cambiarEstado(idPedido: number, idEstadoNuevo: number, idUsuario: number, esCliente: boolean, comentario?: string) {
    return (await execSp<{ idPedido: number; numeroPedido: string; idEstadoPedido: number; estado: string }>('SP_Pedidos_CambiarEstado', [
      P.int('IDPedido', idPedido), P.tiny('IDEstadoNuevo', idEstadoNuevo), P.int('IDUsuario', idUsuario),
      P.bit('EsCliente', esCliente), P.str('Comentario', 500, comentario)])).rows[0]!;
  },

  async transiciones() { return (await execSp('SP_Pedidos_ListarTransiciones')).rows; },

  async devolver(idPedido: number, idUsuario: number, motivo: string, lineas: { idPedidoDetalle: number; cantidad: number }[]) {
    return (await execSp<{ idDevolucion: number; montoReembolsado: number; idEstadoPedido: number; estado: string }>('SP_Devoluciones_Registrar', [
      P.int('IDPedido', idPedido), P.int('IDUsuario', idUsuario), P.str('Motivo', 500, motivo), P.text('Lineas', JSON.stringify(lineas))])).rows[0]!;
  },

  /* ---- Tarea periodica ---- */
  async liberarReservasVencidas(): Promise<number> {
    const { rows } = await execSp<{ unidadesLiberadas: number }>('SP_Inventario_LiberarReservasVencidas');
    return rows[0]?.unidadesLiberadas ?? 0;
  },
};
