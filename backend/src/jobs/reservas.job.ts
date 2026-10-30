import { env } from '../config/env';
import { pedidosRepository } from '../repositories/pedidos.repository';

/**
 * Libera las reservas de existencia vencidas (15 min) sin intervencion manual.
 * Además, el propio SP de reserva y las operaciones de carrito liberan las vencidas de las variantes que tocan,
 * asi que la disponibilidad es correcta aunque el job se retrase.
 */
export function iniciarJobReservas(): () => void {
  if (env.RESERVAS_JOB_SEGUNDOS === 0) return () => undefined;
  let corriendo = false;
  const tick = async () => {
    if (corriendo) return;              // sin solapamiento si una pasada tarda mas que el intervalo
    corriendo = true;
    try {
      const unidades = await pedidosRepository.liberarReservasVencidas();
      if (unidades > 0) console.log(`[job:reservas] ${unidades} unidades liberadas`);
    } catch (err) {
      console.error('[job:reservas] error:', err instanceof Error ? err.message : err);
    } finally {
      corriendo = false;
    }
  };
  const timer = setInterval(() => void tick(), env.RESERVAS_JOB_SEGUNDOS * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
