import { AppError } from '../errors/AppError';
import type { UsuarioRow } from '../repositories/usuarios.repository';
import { pedidosRepository } from '../repositories/pedidos.repository';
import { toPage } from '../utils/pagination';

const ESTADO_CANCELADO = 5;
const esPersonal = (u: UsuarioRow) => u.rol === 'Operador' || u.rol === 'Administrador';

type Filtros = Parameters<typeof pedidosRepository.listar>[0];

export const pedidosService = {
  /** Cliente: SIEMPRE limitado a sus pedidos (el filtro lo fija el servidor, no el cliente)*/
  async misPedidos(u: UsuarioRow, f: Omit<Filtros, 'idUsuarioDueno' | 'cliente'>) {
    return toPage(await pedidosRepository.listar({ ...f, idUsuarioDueno: u.idUsuario }), f.page, f.pageSize);
  },
  async listar(f: Omit<Filtros, 'idUsuarioDueno'>) {
    return toPage(await pedidosRepository.listar(f), f.page, f.pageSize);
  },
  /** Cliente: solo si el pedido es suyo (si no, 404). Personal: cualquiera*/
  detalle: (u: UsuarioRow, idPedido: number) => pedidosRepository.detalle(idPedido, esPersonal(u) ? undefined : u.idUsuario),

  cancelarPropio: (u: UsuarioRow, idPedido: number, comentario?: string) =>
    pedidosRepository.cambiarEstado(idPedido, ESTADO_CANCELADO, u.idUsuario, true, comentario),

  cambiarEstado(u: UsuarioRow, idPedido: number, idEstadoNuevo: number, comentario?: string) {
    if (!esPersonal(u)) throw AppError.forbidden();
    return pedidosRepository.cambiarEstado(idPedido, idEstadoNuevo, u.idUsuario, false, comentario);
  },
  devolver: (u: UsuarioRow, idPedido: number, motivo: string, lineas: { idPedidoDetalle: number; cantidad: number }[]) =>
    pedidosRepository.devolver(idPedido, u.idUsuario, motivo, lineas),
  transiciones: () => pedidosRepository.transiciones(),
};
