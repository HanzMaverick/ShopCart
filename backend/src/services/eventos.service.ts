import type { ServerResponse } from 'node:http';
import type { Rol } from '../utils/tokens';

/**
 * Bus de eventos en memoria para el tiempo real (SSE). El servidor SOLO avisa que algo cambió (ids y estado, nunca montos
 * ni datos personales); el cliente vuelve a consultar la API, que sigue siendo la unica fuente de verdad y aplica sus permisos.
 * Limite conocido: al vivir en memoria funciona con UNA instancia del backend (con varias haria falta Redis pub/sub).
 */
export type TipoEvento = 'pedido.creado' | 'pedido.estado' | 'pedido.devolucion';

export interface EventoNegocio {
  tipo: TipoEvento;
  idPedido: number;
  numeroPedido: string;
  idUsuario: number;       // dueño del pedido
  idActor: number;         // quien provocó el cambio (para no notificar a quien lo hizo)
  idEstadoPedido: number;
  estado: string;
}
export type EventoEmitido = EventoNegocio & { ts: string };

interface Suscriptor { user: { idUsuario: number; rol: Rol }; enviar: (e: EventoEmitido) => void }

const suscriptores = new Set<Suscriptor>();
const conexiones = new Set<ServerResponse>();

/** Un Cliente solo recibe eventos de SUS pedidos; Operador y Administrador reciben los de todos. */
export function puedeVer(user: { idUsuario: number; rol: Rol }, e: EventoNegocio): boolean {
  return user.rol === 'Cliente' ? user.idUsuario === e.idUsuario : true;
}

export const eventos = {
  suscribir(user: Suscriptor['user'], enviar: Suscriptor['enviar']): () => void {
    const s: Suscriptor = { user, enviar };
    suscriptores.add(s);
    return () => { suscriptores.delete(s); };
  },

  /** Nunca lanza: el aviso en tiempo real es un extra y no debe romper la operacion de negocio ya completada. */
  publicar(e: EventoNegocio): void {
    const emitido: EventoEmitido = { ...e, ts: new Date().toISOString() };
    for (const s of suscriptores) {
      if (!puedeVer(s.user, e)) continue;
      try { s.enviar(emitido); } catch { /* un cliente caido no afecta a los demas */ }
    }
  },

  registrarConexion(res: ServerResponse): () => void {
    conexiones.add(res);
    return () => { conexiones.delete(res); };
  },

  /** Apagado ordenado: sin cerrar las conexiones SSE, server.close() esperaria para siempre. */
  cerrarTodo(): void {
    for (const res of conexiones) { try { res.end(); } catch { /* ya cerrada */ } }
    conexiones.clear();
    suscriptores.clear();
  },

  totalSuscriptores: () => suscriptores.size,
};
