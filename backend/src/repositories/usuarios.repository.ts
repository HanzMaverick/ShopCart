import { execSp, P } from '../db/sp';
import type { Rol } from '../utils/tokens';

export interface UsuarioRow {
  idUsuario: number; idRol: number; rol: Rol; correo: string; nombre: string; activo: boolean; fechaCreacion?: Date;
}
export interface UsuarioConHash extends UsuarioRow { contrasenaHash: string }

export const usuariosRepository = {
  async registrar(correo: string, hash: string, nombre: string): Promise<UsuarioRow> {
    const { rows } = await execSp<UsuarioRow>('SP_Usuarios_Registrar',
      [P.str('Correo', 256, correo), P.str('ContrasenaHash', 100, hash), P.str('Nombre', 150, nombre)]);
    return rows[0]!;
  },

  async crearAdministradorInicial(correo: string, hash: string, nombre: string): Promise<UsuarioRow> {
    const { rows } = await execSp<UsuarioRow>('SP_Usuarios_CrearAdministradorInicial',
      [P.str('Correo', 256, correo), P.str('ContrasenaHash', 100, hash), P.str('Nombre', 150, nombre)]);
    return rows[0]!;
  },

  async crear(idRol: number, correo: string, hash: string, nombre: string, actor: number): Promise<UsuarioRow> {
    const { rows } = await execSp<UsuarioRow>('SP_Usuarios_Crear', [
      P.tiny('IDRol', idRol), P.str('Correo', 256, correo), P.str('ContrasenaHash', 100, hash),
      P.str('Nombre', 150, nombre), P.int('IDUsuarioActor', actor)]);
    return rows[0]!;
  },

  async obtenerPorCorreo(correo: string): Promise<UsuarioConHash | undefined> {
    const { rows } = await execSp<UsuarioConHash>('SP_Usuarios_ObtenerPorCorreo', [P.str('Correo', 256, correo)]);
    return rows[0];
  },

  async obtenerPorId(idUsuario: number): Promise<UsuarioRow> {
    const { rows } = await execSp<UsuarioRow>('SP_Usuarios_ObtenerPorID', [P.int('IDUsuario', idUsuario)]);
    return rows[0]!;
  },

  listar(f: { busqueda?: string; idRol?: number; activo?: boolean; page: number; pageSize: number }) {
    return execSp<UsuarioRow & { totalRegistros: number }>('SP_Usuarios_Listar', [
      P.str('Busqueda', 100, f.busqueda), P.tiny('IDRol', f.idRol), P.bit('Activo', f.activo),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)]).then((r) => r.rows);
  },

  async cambiarEstado(idUsuario: number, activo: boolean, actor: number) {
    const { rows } = await execSp<{ idUsuario: number; activo: boolean }>('SP_Usuarios_CambiarEstado',
      [P.int('IDUsuario', idUsuario), P.bit('Activo', activo), P.int('IDUsuarioActor', actor)]);
    return rows[0]!;
  },
};
