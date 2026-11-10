import { createHash } from 'node:crypto';
import { pedidosRepository } from '../repositories/pedidos.repository';
import { eventos } from './eventos.service';

export interface PagoInput { idDireccion: number; metodoPago: 'Tarjeta' | 'Transferencia' | 'Efectivo'; totalEsperado?: number }

/** Hash estable del contenido de la solicitud: misma clave + distinto contenido => 409 en la BD*/
export function hashSolicitud(p: PagoInput): string {
  const canonico = JSON.stringify({ idDireccion: p.idDireccion, metodoPago: p.metodoPago, totalEsperado: p.totalEsperado ?? null });
  return createHash('sha256').update(canonico).digest('hex');
}

export const checkoutService = {
  /** "Iniciar pago": reserva la existencia de todo el carrito durante 15 minutos*/
  iniciar: (idUsuario: number) => pedidosRepository.reservar(idUsuario),

  /**
   * Pago + creacion del pedido. La pasarela de pago esta SIMULADA: el cobro se registra como aprobado dentro de la misma
   * transaccion del pedido. Cuando exista la pasarela real, aqui se llamaria al proveedor reenviando la misma clave de idempotencia
   * antes de invocar al SP, de modo que tampoco el cobro externo pueda duplicarse.
   */
  async pagar(idUsuario: number, clave: string, p: PagoInput) {
    const creado = await pedidosRepository.crear({
      idUsuario, clave, hash: hashSolicitud(p), idDireccion: p.idDireccion, metodoPago: p.metodoPago, totalEsperado: p.totalEsperado,
    });
    const detalle = await pedidosRepository.detalle(creado.idPedido, idUsuario);
    // Solo el pedido NUEVO se anuncia: un reintento idempotente no es un pedido nuevo
    if (!creado.repetida) {
      eventos.publicar({ tipo: 'pedido.creado', idPedido: creado.idPedido, numeroPedido: creado.numeroPedido, idUsuario, idActor: idUsuario, idEstadoPedido: 1, estado: 'Pagado' });
    }
    return { repetida: creado.repetida, ...detalle };
  },
};
