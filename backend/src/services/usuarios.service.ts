import { AppError } from '../errors/AppError';
import { usuariosRepository } from '../repositories/usuarios.repository';
import { authService } from './auth.service';
import { toPage } from '../utils/pagination';

export const usuariosService = {
  async crear(input: { idRol: number; correo: string; contrasena: string; nombre: string }, actor: number) {
    const hash = await authService.hashPassword(input.contrasena);
    return usuariosRepository.crear(input.idRol, input.correo, hash, input.nombre, actor);
  },
  async listar(f: { busqueda?: string; idRol?: number; activo?: boolean; page: number; pageSize: number }) {
    return toPage(await usuariosRepository.listar(f), f.page, f.pageSize);
  },
  async cambiarEstado(idUsuario: number, activo: boolean, actor: number) {
    if (idUsuario === actor && !activo) throw new AppError(422, 'BUSINESS_RULE', 'No puede desactivar su propia cuenta.');
    return usuariosRepository.cambiarEstado(idUsuario, activo, actor);
  },
};
