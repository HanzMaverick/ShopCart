import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export type Rol = 'Cliente' | 'Operador' | 'Administrador';

export interface AccessClaims { sub: number; rol: Rol }

export function signAccessToken(idUsuario: number, rol: Rol): string {
  return jwt.sign({ rol }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: String(idUsuario),
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw AppError.unauthorized('Token invalido.');
    return { sub: Number(payload.sub), rol: payload['rol'] as Rol };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) throw AppError.unauthorized('El token ha expirado.', 'TOKEN_EXPIRED');
    throw AppError.unauthorized('Token invalido.');
  }
}

/** Refresh token opaco: 48 bytes aleatorios. En BD solo se guarda su SHA-256*/
export function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}
