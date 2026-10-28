import { execSp, P } from '../db/sp';

export interface CuponRow {
  idCupon: number; codigo: string; tipo: 'Porcentaje' | 'MontoFijo'; valor: number; montoMinimo: number; fechaInicio: Date; fechaFin: Date;
  limiteUsosTotal: number; limiteUsosPorCliente: number; usosActuales: number; idCategoria: number | null; nombreCategoria?: string | null;
  activo: boolean; totalRegistros?: number;
}
export interface CuponInput {
  codigo: string; tipo: 'Porcentaje' | 'MontoFijo'; valor: number; montoMinimo: number; fechaInicio: Date; fechaFin: Date;
  limiteUsosTotal: number; limiteUsosPorCliente: number; idCategoria?: number | null;
}

const campos = (c: CuponInput) => [
  P.str('Codigo', 30, c.codigo), P.vstr('Tipo', 12, c.tipo), P.money('Valor', c.valor), P.money('MontoMinimo', c.montoMinimo),
  P.date('FechaInicio', c.fechaInicio), P.date('FechaFin', c.fechaFin),
  P.int('LimiteUsosTotal', c.limiteUsosTotal), P.int('LimiteUsosPorCliente', c.limiteUsosPorCliente), P.int('IDCategoria', c.idCategoria ?? null),
];

export const cuponesRepository = {
  async crear(c: CuponInput, actor: number) {
    return (await execSp<CuponRow>('SP_Cupones_Crear', [...campos(c), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async actualizar(id: number, c: CuponInput, activo: boolean, actor: number) {
    return (await execSp<CuponRow>('SP_Cupones_Actualizar', [P.int('IDCupon', id), ...campos(c), P.bit('Activo', activo), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async cambiarEstado(id: number, activo: boolean, actor: number) {
    return (await execSp<{ idCupon: number; codigo: string; activo: boolean }>('SP_Cupones_CambiarEstado',
      [P.int('IDCupon', id), P.bit('Activo', activo), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async obtener(id: number) { return (await execSp<CuponRow>('SP_Cupones_ObtenerPorID', [P.int('IDCupon', id)])).rows[0]!; },
  async listar(f: { busqueda?: string; activo?: boolean; soloVigentes?: boolean; page: number; pageSize: number }) {
    return (await execSp<CuponRow & { totalRegistros: number }>('SP_Cupones_Listar', [
      P.str('Busqueda', 30, f.busqueda), P.bit('Activo', f.activo), P.bit('SoloVigentes', f.soloVigentes),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)])).rows;
  },
};
