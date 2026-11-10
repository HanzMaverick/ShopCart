/**
 * Prueba de extremo a extremo del canal SSE: servidor real, autenticacion real (JWT) y repositorio de usuarios simulado.
 * Verifica cabeceras, exigencia de sesion y que cada rol reciba solo los eventos que le corresponden.
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

Object.assign(process.env, {
  DB_SERVER: '127.0.0.1', DB_USER: 'test', DB_PASSWORD: 'test', RESERVAS_JOB_SEGUNDOS: '0', BCRYPT_ROUNDS: '10',
  JWT_ACCESS_SECRET: process.env['JWT_ACCESS_SECRET'] ?? '0123456789abcdef0123456789abcdef0123',
});

let server: Server;
let base = '';
let tokens: { cliente7: string; cliente8: string; operador: string };
let eventos: typeof import('../services/eventos.service.js').eventos;

const evento = (idUsuario: number, estado = 'Despachado') => ({
  tipo: 'pedido.estado' as const, idPedido: idUsuario * 10, numeroPedido: `SC-${idUsuario}`, idUsuario, idActor: 99, idEstadoPedido: 3, estado,
});

/**Abre el stream y devuelve utilidades para leer lo recibido*/
async function abrir(token: string) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/api/eventos/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let texto = '';
  const leyendo = (async () => { try { for (;;) { const { done, value } = await reader.read(); if (done) break; texto += dec.decode(value, { stream: true }); } } catch { /* abortado */ } })();
  const esperar = async (fragmento: string, ms = 1500) => {
    const limite = Date.now() + ms;
    while (!texto.includes(fragmento)) { if (Date.now() > limite) return false; await new Promise((r) => setTimeout(r, 20)); }
    return true;
  };
  return { res, esperar, texto: () => texto, cerrar: async () => { ctl.abort(); await leyendo; } };
}

describe('GET /api/eventos/stream', () => {
  before(async () => {
    const { createApp } = await import('../app.js');
    const { usuariosRepository } = await import('../repositories/usuarios.repository.js');
    const { signAccessToken } = await import('../utils/tokens.js');
    ({ eventos } = await import('../services/eventos.service.js'));
    const roles = { 7: 'Cliente', 8: 'Cliente', 1: 'Operador' } as const;
    usuariosRepository.obtenerPorId = async (id: number) =>
      ({ idUsuario: id, idRol: 1, rol: roles[id as 7 | 8 | 1], correo: `u${id}@t.co`, nombre: `U${id}`, activo: true });
    tokens = { cliente7: signAccessToken(7, 'Cliente'), cliente8: signAccessToken(8, 'Cliente'), operador: signAccessToken(1, 'Operador') };
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => { eventos.cerrarTodo(); server.close(); });

  it('exige sesion', async () => {
    const res = await fetch(`${base}/api/eventos/stream`);
    assert.equal(res.status, 401);
  });

  it('responde como text/event-stream y confirma la conexion', async () => {
    const s = await abrir(tokens.cliente7);
    assert.match(s.res.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.ok(await s.esperar('event: conectado'));
    await s.cerrar();
  });

  it('cada rol recibe solo lo que le corresponde', async () => {
    const c7 = await abrir(tokens.cliente7);
    const c8 = await abrir(tokens.cliente8);
    const op = await abrir(tokens.operador);
    await Promise.all([c7.esperar('conectado'), c8.esperar('conectado'), op.esperar('conectado')]);

    eventos.publicar(evento(7));

    assert.ok(await c7.esperar('"numeroPedido":"SC-7"'), 'el dueno recibe su evento');
    assert.ok(await op.esperar('"numeroPedido":"SC-7"'), 'el operador recibe todos');
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(!c8.texto().includes('SC-7'), 'otro cliente NO recibe eventos ajenos');
    assert.match(c7.texto(), /event: pedido\.estado/);
    await Promise.all([c7.cerrar(), c8.cerrar(), op.cerrar()]);
  });

  it('cierra el canal cuando vence el token (el cliente reconecta y renueva la sesion)', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const corto = jwt.sign({ rol: 'Cliente' }, process.env['JWT_ACCESS_SECRET']!, { algorithm: 'HS256', subject: '7', expiresIn: 1 });
    const ctl = new AbortController();
    const res = await fetch(`${base}/api/eventos/stream`, { headers: { Authorization: `Bearer ${corto}` }, signal: ctl.signal });
    const reader = res.body!.getReader();
    const inicio = Date.now();
    for (;;) { const { done } = await reader.read(); if (done) break; if (Date.now() - inicio > 5000) break; }
    assert.ok(Date.now() - inicio < 4500, 'el servidor debio cerrar la conexion poco despues de expirar el token');
    ctl.abort();
  });

  it('al cerrar la conexion el servidor libera al suscriptor', async () => {
    const s = await abrir(tokens.cliente7);
    await s.esperar('conectado');
    const antes = eventos.totalSuscriptores();
    await s.cerrar();
    const limite = Date.now() + 1500;
    while (eventos.totalSuscriptores() >= antes && Date.now() < limite) await new Promise((r) => setTimeout(r, 20));
    assert.ok(eventos.totalSuscriptores() < antes);
  });
});
