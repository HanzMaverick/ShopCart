import { AppError } from '../errors/AppError';
import type { UsuarioRow } from '../repositories/usuarios.repository';
import { pedidosRepository } from '../repositories/pedidos.repository';
import { toPage } from '../utils/pagination';
import { eventos } from './eventos.service';

const ESTADO_CANCELADO = 5;
const esPersonal = (u: UsuarioRow) => u.rol === 'Operador' || u.rol === 'Administrador';

type Filtros = Parameters<typeof pedidosRepository.listar>[0];

/** Dueño y número de un pedido, para anunciar el cambio. Si falla, simplemente no se anuncia (la operacion ya se completo)*/
async function duenoYNumero(idPedido: number): Promise<{ idUsuario: number; numeroPedido: string } | null> {
  try {
    const { pedido } = await pedidosRepository.detalle(idPedido);
    return { idUsuario: Number(pedido['idUsuario']), numeroPedido: String(pedido['numeroPedido']) };
  } catch {
    return null;
  }
}

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

  async cancelarPropio(u: UsuarioRow, idPedido: number, comentario?: string) {
    const r = await pedidosRepository.cambiarEstado(idPedido, ESTADO_CANCELADO, u.idUsuario, true, comentario);
    eventos.publicar({ tipo: 'pedido.estado', idPedido: r.idPedido, numeroPedido: r.numeroPedido, idUsuario: u.idUsuario, idActor: u.idUsuario, idEstadoPedido: r.idEstadoPedido, estado: r.estado });
    return r;
  },

  async cambiarEstado(u: UsuarioRow, idPedido: number, idEstadoNuevo: number, comentario?: string) {
    if (!esPersonal(u)) throw AppError.forbidden();
    const r = await pedidosRepository.cambiarEstado(idPedido, idEstadoNuevo, u.idUsuario, false, comentario);
    const d = await duenoYNumero(r.idPedido);
    if (d) eventos.publicar({ tipo: 'pedido.estado', idPedido: r.idPedido, numeroPedido: r.numeroPedido, idUsuario: d.idUsuario, idActor: u.idUsuario, idEstadoPedido: r.idEstadoPedido, estado: r.estado });
    return r;
  },

  async devolver(u: UsuarioRow, idPedido: number, motivo: string, lineas: { idPedidoDetalle: number; cantidad: number }[]) {
    const r = await pedidosRepository.devolver(idPedido, u.idUsuario, motivo, lineas);
    const d = await duenoYNumero(idPedido);
    if (d) eventos.publicar({ tipo: 'pedido.devolucion', idPedido, numeroPedido: d.numeroPedido, idUsuario: d.idUsuario, idActor: u.idUsuario, idEstadoPedido: r.idEstadoPedido, estado: r.estado });
    return r;
  },
  transiciones: () => pedidosRepository.transiciones(),
};
