import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ApiError, api } from './http';
import { cartToken, session } from './session';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let handler: Handler = () => new Response('{}');
const calls: { url: string; headers: Record<string, string> }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  calls.push({ url: String(input), headers: (init.headers ?? {}) as Record<string, string> });
  return handler(String(input), init);
}) as typeof fetch;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const usuario = { idUsuario: 1, correo: 'a@b.co', nombre: 'A', rol: 'Cliente' };

beforeEach(() => { store.clear(); calls.length = 0; session.clear(); session.setExpiredHandler(null); });

describe('renovacion transparente del token', () => {
  it('con 3 peticiones simultaneas y token vencido renueva UNA sola vez y reintenta todas', async () => {
    session.setTokens('A1', 'R1');
    let refreshCalls = 0;
    handler = async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { accessToken: 'A2', refreshToken: 'R2', tokenType: 'Bearer', usuario });
      }
      const auth = (init.headers as Record<string, string>)['Authorization'];
      return auth === 'Bearer A2' ? json(200, { ok: true }) : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expirado' } });
    };
    const res = await Promise.all([api('/pedidos/mis'), api('/pedidos/1'), api('/inventario')]);
    assert.equal(refreshCalls, 1, 'el refresh token rota: no puede usarse dos veces');
    assert.deepEqual(res, [{ ok: true }, { ok: true }, { ok: true }]);
    assert.equal(session.getRefresh(), 'R2');
    assert.equal(session.getAccess(), 'A2');
  });

  it('si el refresh token es invalido cierra la sesion una vez y propaga el error', async () => {
    session.setTokens('A1', 'R1');
    let expired = 0;
    session.setExpiredHandler(() => { expired++; });
    handler = (url) => (url.endsWith('/auth/refresh') ? json(401, { error: { code: 'UNAUTHORIZED', message: 'Sesion invalida' } }) : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expirado' } }));
    await assert.rejects(api('/pedidos/mis'), (e: unknown) => e instanceof ApiError && e.status === 401);
    assert.equal(expired, 1);
    assert.equal(session.getRefresh(), null);
    assert.equal(session.getAccess(), null);
  });

  it('una falla de red al renovar NO cierra la sesion (el usuario puede reintentar)', async () => {
    session.setTokens('A1', 'R1');
    let expired = 0;
    session.setExpiredHandler(() => { expired++; });
    handler = (url) => { if (url.endsWith('/auth/refresh')) throw new TypeError('fetch failed'); return json(401, { error: { code: 'TOKEN_EXPIRED', message: 'x' } }); };
    await assert.rejects(api('/pedidos/mis'), (e: unknown) => e instanceof ApiError && e.isNetwork);
    assert.equal(expired, 0);
    assert.equal(session.getRefresh(), 'R1');
  });

  it('no intenta renovar en login ni registro (auth:false)', async () => {
    session.setTokens('A1', 'R1');
    handler = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contrasena incorrectos.' } });
    await assert.rejects(api('/auth/login', { method: 'POST', body: {}, auth: false }), (e: unknown) => e instanceof ApiError && e.code === 'INVALID_CREDENTIALS');
    assert.equal(calls.length, 1);
  });
});

describe('carrito de invitado y errores', () => {
  it('envia X-Cart-Token solo en /carrito y solo sin sesion', async () => {
    handler = () => json(200, {});
    cartToken.set('11111111-1111-4111-8111-111111111111');
    await api('/carrito');
    await api('/tienda/productos');
    assert.equal(calls[0]?.headers['X-Cart-Token'], '11111111-1111-4111-8111-111111111111');
    assert.equal(calls[1]?.headers['X-Cart-Token'], undefined);
    session.setTokens('A1', 'R1');
    calls.length = 0;
    await api('/carrito');
    assert.equal(calls[0]?.headers['X-Cart-Token'], undefined);
    assert.equal(calls[0]?.headers['Authorization'], 'Bearer A1');
  });

  it('traduce errores de validacion y de red a ApiError', async () => {
    handler = () => json(422, { error: { code: 'VALIDATION_ERROR', message: 'Datos invalidos', details: [{ campo: 'correo', mensaje: 'Correo invalido.' }] } });
    await assert.rejects(api('/x', { method: 'POST', body: {} }), (e: unknown) => e instanceof ApiError && e.status === 422 && e.details?.[0]?.campo === 'correo');
    handler = () => { throw new TypeError('fetch failed'); };
    await assert.rejects(api('/x'), (e: unknown) => e instanceof ApiError && e.isNetwork);
  });
});
