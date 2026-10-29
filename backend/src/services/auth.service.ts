import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { authRepository } from '../repositories/auth.repository';
import { usuariosRepository, type UsuarioRow } from '../repositories/usuarios.repository';
import { newRefreshToken, refreshExpiry, sha256Hex, signAccessToken } from '../utils/tokens';

// Hash falso para comparar siempre en tiempo similar, exista o no el correo (evita enumeracion por timing)
const DUMMY_HASH = bcrypt.hashSync('contrasena-inexistente', env.BCRYPT_ROUNDS);

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  usuario: Pick<UsuarioRow, 'idUsuario' | 'correo' | 'nombre' | 'rol'>;
}

const publicUser = (u: UsuarioRow) => ({ idUsuario: u.idUsuario, correo: u.correo, nombre: u.nombre, rol: u.rol });

async function abrirSesion(u: UsuarioRow): Promise<Sesion> {
  const refreshToken = newRefreshToken();
  await authRepository.guardarToken(u.idUsuario, randomUUID(), sha256Hex(refreshToken), refreshExpiry());
  return { accessToken: signAccessToken(u.idUsuario, u.rol), refreshToken, tokenType: 'Bearer', usuario: publicUser(u) };
}

export const authService = {
  hashPassword: (plain: string) => bcrypt.hash(plain, env.BCRYPT_ROUNDS),

  async register(input: { correo: string; contrasena: string; nombre: string }): Promise<Sesion> {
    const hash = await authService.hashPassword(input.contrasena);
    return abrirSesion(await usuariosRepository.registrar(input.correo, hash, input.nombre));
  },

  async login(correo: string, contrasena: string): Promise<Sesion> {
    const user = await usuariosRepository.obtenerPorCorreo(correo);
    const coincide = await bcrypt.compare(contrasena, user?.contrasenaHash ?? DUMMY_HASH);
    if (!user || !coincide) throw AppError.unauthorized('Correo o contrasena incorrectos.', 'INVALID_CREDENTIALS');
    if (!user.activo) throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta esta desactivada.');
    return abrirSesion(user);
  },

  /** Rotacion: el token presentado se invalida y se entrega uno nuevo de la misma familia*/
  async refresh(refreshToken: string): Promise<Sesion> {
    const nuevo = newRefreshToken();
    const user = await authRepository.rotarToken(sha256Hex(refreshToken), sha256Hex(nuevo), refreshExpiry());
    return { accessToken: signAccessToken(user.idUsuario, user.rol), refreshToken: nuevo, tokenType: 'Bearer', usuario: publicUser(user) };
  },

  async logout(refreshToken: string): Promise<void> {
    await authRepository.revocarFamilia(sha256Hex(refreshToken));
  },
};
