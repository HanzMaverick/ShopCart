import { openStream } from './http';
import type { EventoServidor } from './types';

export interface SseMessage { event: string; data: string }

/**Extrae los mensajes SSE completos de un buffer y devuelve el resto (mensaje a medias). Ignora comentarios (latidos)*/
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const bloques = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = bloques.pop() ?? '';
  const messages: SseMessage[] = [];
  for (const bloque of bloques) {
    let event = 'message';
    const data: string[] = [];
    for (const linea of bloque.split('\n')) {
      if (!linea || linea.startsWith(':')) continue;
      const i = linea.indexOf(':');
      const campo = i === -1 ? linea : linea.slice(0, i);
      const valor = i === -1 ? '' : linea.slice(i + 1).replace(/^ /, '');
      if (campo === 'event') event = valor; else if (campo === 'data') data.push(valor);
    }
    if (data.length > 0 || event !== 'message') messages.push({ event, data: data.join('\n') });
  }
  return { messages, rest };
}

export interface StreamHandlers { onEvent: (e: EventoServidor) => void; onOpen: () => void; onClose: () => void }
export interface StreamOptions { baseDelayMs?: number; maxDelayMs?: number; watchdogMs?: number }

const dormir = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/**
 * Mantiene abierto el canal de eventos del servidor y reconecta solo (espera creciente con jitter).
 * - Si el servidor cierra al vencer el token, la reconexion renueva la sesion de forma transparente.
 * - Un "pg" reconecta si pasan 70s sin recibir nada (el servidor envia un latido cada 25s).
 * Devuelve la funcion para detenerlo.
 */
export function connectEvents(h: StreamHandlers, opts: StreamOptions = {}): () => void {
  const { baseDelayMs = 1000, maxDelayMs = 30_000, watchdogMs = 70_000 } = opts;
  const global = new AbortController();
  let detenido = false;

  void (async () => {
    let intento = 0;
    while (!detenido) {
      const conexion = new AbortController();
      const abortarConexion = () => conexion.abort();
      global.signal.addEventListener('abort', abortarConexion, { once: true });
      let guardian: ReturnType<typeof setTimeout> | undefined;
      try {
        const res = await openStream('/eventos/stream', conexion.signal);
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        h.onOpen();
        intento = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          clearTimeout(guardian);
          guardian = setTimeout(abortarConexion, watchdogMs);
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { messages, rest } = parseSse(buffer);
          buffer = rest;
          for (const m of messages) {
            if (!m.event.startsWith('pedido.')) continue;
            try { h.onEvent(JSON.parse(m.data) as EventoServidor); } catch { /* mensaje malformado: se ignora */ }
          }
        }
      } catch {
        /* caida de red, 401 irrecuperable, abortado: se decide abajo */
      } finally {
        clearTimeout(guardian);
        global.signal.removeEventListener('abort', abortarConexion);
      }
      if (detenido) break;
      h.onClose();
      await dormir(Math.min(maxDelayMs, baseDelayMs * 2 ** intento) + Math.random() * baseDelayMs * 0.3, global.signal);
      intento++;
    }
  })();

  return () => { detenido = true; global.abort(); };
}
