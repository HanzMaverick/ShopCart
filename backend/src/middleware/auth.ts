import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { usuariosRepository, type UsuarioRow } from '../repositories/usuarios.repository';
import { verifyAccessToken, type Rol } from '../utils/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: UsuarioRow }
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { cartOwner?: CartOwner }
  }
}

export interface CartOwner { idUsuario?: number; tokenInvitado?: string }

/**
 * Valida el JWT y recarga al usuario desde la BD en cada peticion (busqueda por PK):
 * asi una cuenta desactivada o un cambio de rol surten efecto de inmediato, sin esperar a que expire el token.
 */
export async function loadUser(req: Parameters<RequestHandler>[0]): Promise<UsuarioRow> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('Falta el token de acceso.');
  const claims = verifyAccessToken(header.slice(7));

  let user: UsuarioRow;
  try {
    user = await usuariosRepository.obtenerPorId(claims.sub);
  } catch (err) {
    if (err instanceof Error && (err as { number?: number }).number === 50010) throw AppError.unauthorized('Usuario no valido.');
    throw err;
  }
  if (!user.activo) throw AppError.unauthorized('La cuenta esta desactivada.', 'ACCOUNT_DISABLED');
  return user;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  req.user = await loadUser(req);
  next();
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dueño del carrito: usuario autenticado (rol Cliente) o invitado identificado por el header X-Cart-Token.
 * El dueño SIEMPRE se deriva del JWT o del token; ningun endpoint acepta un id de carrito del cliente.
 */
export const resolveCartOwner: RequestHandler = async (req, _res, next) => {
  if (req.headers.authorization) {
    const user = await loadUser(req);
    if (user.rol !== 'Cliente') throw AppError.forbidden('Solo los clientes pueden usar el carrito.');
    req.user = user;
    req.cartOwner = { idUsuario: user.idUsuario };
  } else {
    const token = req.header('x-cart-token');
    if (token !== undefined && !UUID.test(token)) throw new AppError(422, 'VALIDATION_ERROR', 'X-Cart-Token invalido.');
    req.cartOwner = token ? { tokenInvitado: token } : {};
  }
  next();
};

export const authorize = (...roles: Rol[]): RequestHandler => (req, _res, next) => {
  if (!req.user) throw AppError.unauthorized();
  if (!roles.includes(req.user.rol)) throw AppError.forbidden();
  next();
};

/** Usuario autenticado garantizado (tras `authenticate`). */
export function currentUser(req: Parameters<RequestHandler>[0]): UsuarioRow {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
