/**Pruebas del canal de tiempo real: lectura del formato SSE, reconexion automatica y perro guardian*/
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { session } from './session';
import { connectEvents, parseSse } from './stream';
import type { EventoServidor } from './types';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});

const evento = (n: number): EventoServidor => ({ tipo: 'pedido.estado', idPedido: n, numeroPedido: `SC-${n}`, idUsuario: 7, idActor: 1, idEstadoPedido: 3, estado: 'Despachado', ts: '2026-11-01T00:00:00.000Z' });
const sse = (e: EventoServidor) => `event: ${e.tipo}\ndata: ${JSON.stringify(e)}\n\n`;
const enc = new TextEncoder();
const esperar = async (cond: () => boolean, ms = 2000) => { const fin = Date.now() + ms; while (!cond()) { if (Date.now() > fin) return false; await new Promise((r) => setTimeout(r, 10)); } return true; };

describe('parseSse', () => {
  it('lee varios mensajes y deja el resto incompleto para la siguiente lectura', () => {
    const { messages, rest } = parseSse(`${sse(evento(1))}${sse(evento(2))}event: pedido.estado\ndata: {"idPedido`);
    assert.equal(messages.length, 2);
    assert.equal(JSON.parse(messages[1]!.data).idPedido, 2);
    assert.ok(rest.startsWith('event: pedido.estado'));
  });
  it('funciona aunque el mensaje llegue partido en cualquier punto', () => {
    const completo = sse(evento(5));
    for (let corte = 1; corte < completo.length; corte++) {
      const a = parseSse(completo.slice(0, corte));
      const b = parseSse(a.rest + completo.slice(corte));
      const todos = [...a.messages, ...b.messages];
      assert.equal(todos.length, 1, `corte en ${corte}`);
      assert.equal(JSON.parse(todos[0]!.data).idPedido, 5);
    }
  });
  it('ignora latidos y comentarios, y acepta saltos de linea CRLF', () => {
    const { messages } = parseSse(`: latido\n\nretry: 5000\nevent: conectado\ndata: {"rol":"Cliente"}\r\n\r\n`);
    assert.deepEqual(messages, [{ event: 'conectado', data: '{"rol":"Cliente"}' }]);
  });
});

describe('connectEvents', () => {
  beforeEach(() => { store.clear(); session.clear(); session.setTokens('ACCESO', 'REFRESCO'); });

  it('entrega los eventos, avisa la apertura y reconecta al terminar el stream', async () => {
    let conexiones = 0;
    const auth: (string | undefined)[] = [];
    globalThis.fetch = (async (_url: RequestInfo | URL, init: RequestInit = {}) => {
      conexiones++;
      auth.push((init.headers as Record<string, string>)['Authorization']);
      const cuerpo = new ReadableStream({ start(c) { c.enqueue(enc.encode(`event: conectado\ndata: {}\n\n${sse(evento(conexiones))}`)); c.close(); } });
      return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as typeof fetch;

    const recibidos: number[] = []; let aperturas = 0; let cierres = 0;
    const detener = connectEvents({ onEvent: (e) => recibidos.push(e.idPedido), onOpen: () => { aperturas++; }, onClose: () => { cierres++; } }, { baseDelayMs: 10, maxDelayMs: 20 });
    assert.ok(await esperar(() => conexiones >= 2 && recibidos.length >= 2), 'debe reconectar y volver a recibir');
    detener();
    assert.deepEqual(recibidos.slice(0, 2), [1, 2]);
    assert.ok(aperturas >= 2 && cierres >= 1);
    assert.ok(auth.every((a) => a === 'Bearer ACCESO'), 'envia el token en la cabecera, no en la URL');
  });

  it('detenerlo corta la conexion y no vuelve a reconectar', async () => {
    let conexiones = 0;
    globalThis.fetch = (async (_url: RequestInfo | URL, init: RequestInit = {}) => {
      conexiones++;
      const cuerpo = new ReadableStream({ start(c) { init.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError'))); } });
      return new Response(cuerpo, { status: 200 });
    }) as typeof fetch;
    let aperturas = 0;
    const detener = connectEvents({ onEvent: () => undefined, onOpen: () => { aperturas++; }, onClose: () => undefined }, { baseDelayMs: 10 });
    assert.ok(await esperar(() => aperturas === 1));
    detener();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(conexiones, 1);
  });

  it('el perro guardian reconecta si el servidor deja de enviar (ni eventos ni latidos)', async () => {
    let conexiones = 0;
    globalThis.fetch = (async (_url: RequestInfo | URL, init: RequestInit = {}) => {
      conexiones++;
      const cuerpo = new ReadableStream({ start(c) { init.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError'))); } });
      return new Response(cuerpo, { status: 200 });
    }) as typeof fetch;
    const detener = connectEvents({ onEvent: () => undefined, onOpen: () => undefined, onClose: () => undefined }, { baseDelayMs: 10, maxDelayMs: 20, watchdogMs: 60 });
    assert.ok(await esperar(() => conexiones >= 2, 2000), 'una conexion muda debe reiniciarse');
    detener();
  });

  it('con 401 renueva la sesion y vuelve a abrir el canal con el token nuevo', async () => {
    const usados: (string | undefined)[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'NUEVO', refreshToken: 'R2', tokenType: 'Bearer', usuario: { idUsuario: 7, correo: 'a@b.co', nombre: 'A', rol: 'Cliente' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const token = (init.headers as Record<string, string>)['Authorization'];
      usados.push(token);
      if (token === 'Bearer ACCESO') return new Response('{}', { status: 401 });
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(sse(evento(9)))); } }), { status: 200 });
    }) as typeof fetch;
    const recibidos: number[] = [];
    const detener = connectEvents({ onEvent: (e) => recibidos.push(e.idPedido), onOpen: () => undefined, onClose: () => undefined }, { baseDelayMs: 10 });
    assert.ok(await esperar(() => recibidos.length === 1));
    detener();
    assert.deepEqual(usados, ['Bearer ACCESO', 'Bearer NUEVO']);
    assert.equal(session.getRefresh(), 'R2');
  });
});
