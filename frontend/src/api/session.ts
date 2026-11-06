/**
 * Sesion en el navegador.
 * - Access token (15 min): solo en memoria (no persiste: si se recarga la pagina se renueva con el refresh token).
 * - Refresh token (rota en cada uso): localStorage, para sobrevivir recargas y compartirse entre pestanas.
 *   Riesgo conocido (XSS) y mejora posible: cookie httpOnly + proteccion CSRF (ver README).
 */
const REFRESH_KEY = 'shopcart.refresh';
const CART_KEY = 'shopcart.cartToken';

let accessToken: string | null = null;
let onExpired: (() => void) | null = null;

export const session = {
  getAccess: () => accessToken,
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setTokens(access: string, refresh: string) { accessToken = access; localStorage.setItem(REFRESH_KEY, refresh); },
  clear() { accessToken = null; localStorage.removeItem(REFRESH_KEY); },
  /** La app registra aqui que hacer cuando la sesion ya no es recuperable (ir a /login). */
  setExpiredHandler(fn: (() => void) | null) { onExpired = fn; },
  expire() { this.clear(); onExpired?.(); },
};

/**Token del carrito de invitado (header X-Cart-Token)*/
export const cartToken = {
  get: () => localStorage.getItem(CART_KEY),
  set: (t: string) => localStorage.setItem(CART_KEY, t),
  clear: () => localStorage.removeItem(CART_KEY),
};
