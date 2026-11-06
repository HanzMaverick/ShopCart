import { cartToken, session } from './session';
import type { Sesion, Usuario } from './types';

const BASE = `${import.meta.env?.VITE_API_URL ?? ''}/api`;

export interface FieldError { campo: string; mensaje: string }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: FieldError[]) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() { return this.status === 0; }
}

type Query = Record<string, string | number | boolean | Date | null | undefined>;
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  /** false: no adjunta token ni intenta renovarlo (login, registro, refresh). */
  auth?: boolean;
  signal?: AbortSignal;
  retried?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, v instanceof Date ? v.toISOString() : String(v));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: FieldError[] } };
    return new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? `Error ${res.status}`, body.error?.details);
  } catch {
    return new ApiError(res.status, 'ERROR', `Error ${res.status}`);
  }
}

/*Renovacion transparente del token*/
type RefreshResult = 'ok' | 'invalid' | 'network';
let refreshing: Promise<RefreshResult> | null = null;
let onUserRefreshed: ((u: Usuario) => void) | null = null;
export const setUserRefreshedHandler = (fn: ((u: Usuario) => void) | null) => { onUserRefreshed = fn; };

async function doRefresh(): Promise<RefreshResult> {
  const refreshToken = session.getRefresh();   // se lee dentro del candado: puede haberlo rotado otra pestana
  if (!refreshToken) return 'invalid';
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    if (!res.ok) return res.status >= 500 ? 'network' : 'invalid';
    const s = (await res.json()) as Sesion;
    session.setTokens(s.accessToken, s.refreshToken);
    onUserRefreshed?.(s.usuario);
    return 'ok';
  } catch {
    return 'network';
  }
}

/**
 * Una sola renovacion a la vez: en esta pestaña (promesa compartida) y entre pestanas (Web Locks).
 * Es indispensable porque el refresh token rota: dos renovaciones simultaneas con el mismo token invalidarian la sesion.
 */
export function refreshSession(): Promise<RefreshResult> {
  refreshing ??= (async () => {
    try {
      return navigator.locks ? await navigator.locks.request('shopcart-refresh', doRefresh) : await doRefresh();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/*Cliente HTTP*/
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal, retried = false } = opts;
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const access = session.getAccess();
  if (auth && access) headers['Authorization'] = `Bearer ${access}`;
  if (path.startsWith('/carrito') && !access) {            // carrito de invitado
    const t = cartToken.get();
    if (t) headers['X-Cart-Token'] = t;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor. Revise su conexion e intente de nuevo.');
  }

  if (res.status === 401 && auth && !retried && session.getRefresh()) {
    const result = await refreshSession();
    if (result === 'ok') return api<T>(path, { ...opts, retried: true });
    if (result === 'invalid') {
      const err = await readError(res);
      session.expire();
      throw err;
    }
    throw new ApiError(0, 'NETWORK', 'No se pudo renovar la sesion por un problema de conexion.');
  }

  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
