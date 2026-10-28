import { execSp, P } from '../db/sp';

export interface DireccionRow {
  idDireccion: number; alias: string; linea1: string; linea2: string | null; ciudad: string; departamento: string; telefono: string;
}
export type DireccionInput = Omit<DireccionRow, 'idDireccion'>;

export const direccionesRepository = {
  async listar(idUsuario: number) {
    return (await execSp<DireccionRow>('SP_Direcciones_Listar', [P.int('IDUsuario', idUsuario)])).rows;
  },
  async crear(idUsuario: number, d: DireccionInput) {
    return (await execSp<DireccionRow>('SP_Direcciones_Crear', [
      P.int('IDUsuario', idUsuario), P.str('Alias', 50, d.alias), P.str('Linea1', 200, d.linea1), P.str('Linea2', 200, d.linea2),
      P.str('Ciudad', 100, d.ciudad), P.str('Departamento', 100, d.departamento), P.str('Telefono', 20, d.telefono)])).rows[0]!;
  },
  async actualizar(idUsuario: number, idDireccion: number, d: DireccionInput) {
    return (await execSp<DireccionRow>('SP_Direcciones_Actualizar', [
      P.int('IDUsuario', idUsuario), P.int('IDDireccion', idDireccion), P.str('Alias', 50, d.alias), P.str('Linea1', 200, d.linea1),
      P.str('Linea2', 200, d.linea2), P.str('Ciudad', 100, d.ciudad), P.str('Departamento', 100, d.departamento), P.str('Telefono', 20, d.telefono)])).rows[0]!;
  },
  async desactivar(idUsuario: number, idDireccion: number): Promise<void> {
    await execSp('SP_Direcciones_Desactivar', [P.int('IDUsuario', idUsuario), P.int('IDDireccion', idDireccion)]);
  },
};
