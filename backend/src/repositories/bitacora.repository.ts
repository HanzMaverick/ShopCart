import { execSp, P, parseJson } from '../db/sp';

export interface BitacoraRow {
  idBitacora: number; modulo: string; entidad: string; idEntidad: number; accion: string;
  valorAnterior: unknown; valorNuevo: unknown; idUsuario: number; nombreUsuario: string; fecha: Date; totalRegistros: number;
}

export const bitacoraRepository = {
  async listar(modulo: string | undefined, page: number, pageSize: number): Promise<BitacoraRow[]> {
    const { rows } = await execSp<BitacoraRow>('SP_Bitacora_Listar', [P.vstr('Modulo', 20, modulo), P.int('Pagina', page), P.int('TamanoPagina', pageSize)]);
    return rows.map((r) => ({ ...r, valorAnterior: parseJson(r.valorAnterior), valorNuevo: parseJson(r.valorNuevo) }));
  },
};
