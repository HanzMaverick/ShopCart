import { execSp, P } from '../db/sp';
import type { UsuarioRow } from './usuarios.repository';

export const authRepository = {
  async guardarToken(idUsuario: number, idFamilia: string, tokenHash: string, expira: Date): Promise<void> {
    await execSp('SP_Auth_GuardarTokenRefresco', [
      P.int('IDUsuario', idUsuario), P.guid('IDFamilia', idFamilia), P.char('TokenHash', 64, tokenHash), P.date('FechaExpira', expira)]);
  },

  async rotarToken(hashActual: string, hashNuevo: string, expiraNueva: Date): Promise<UsuarioRow> {
    const { rows } = await execSp<UsuarioRow>('SP_Auth_RotarTokenRefresco', [
      P.char('TokenHashActual', 64, hashActual), P.char('TokenHashNuevo', 64, hashNuevo), P.date('FechaExpiraNueva', expiraNueva)]);
    return rows[0]!;
  },

  async revocarFamilia(tokenHash: string): Promise<void> {
    await execSp('SP_Auth_RevocarFamilia', [P.char('TokenHash', 64, tokenHash)]);
  },
};
