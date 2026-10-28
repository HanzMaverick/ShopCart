import { execSp, P } from '../db/sp';

export interface ExistenciaRow {
  idVariante: number; sku: string; atributos: string; idProducto: number; nombreProducto: string; nombreCategoria: string;
  existenciaFisica: number; existenciaReservada: number; existenciaDisponible: number; varianteActiva: boolean; totalRegistros: number;
}
export interface KardexRow {
  idKardex: number; tipoMovimiento: string; cantidad: number; existenciaResultante: number; motivo: string;
  idPedido: number | null; idUsuario: number; nombreUsuario: string; fecha: Date; totalRegistros: number;
}

export const inventarioRepository = {
  async listar(f: { texto?: string; idCategoria?: number; umbralBajo?: number; page: number; pageSize: number }) {
    return (await execSp<ExistenciaRow>('SP_Inventario_Listar', [
      P.str('Texto', 100, f.texto), P.int('IDCategoria', f.idCategoria), P.int('UmbralBajo', f.umbralBajo),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)])).rows;
  },
  async kardex(idVariante: number, f: { tipo?: string; desde?: Date; hasta?: Date; page: number; pageSize: number }) {
    return (await execSp<KardexRow>('SP_Inventario_ObtenerKardex', [
      P.int('IDVariante', idVariante), P.vstr('TipoMovimiento', 10, f.tipo), P.date('FechaDesde', f.desde), P.date('FechaHasta', f.hasta),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)])).rows;
  },
  async entrada(idVariante: number, cantidad: number, motivo: string, actor: number) {
    return (await execSp('SP_Inventario_RegistrarEntrada', [P.int('IDVariante', idVariante), P.int('Cantidad', cantidad), P.str('Motivo', 300, motivo), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async ajuste(idVariante: number, cantidad: number, motivo: string, actor: number) {
    return (await execSp('SP_Inventario_Ajustar', [P.int('IDVariante', idVariante), P.int('Cantidad', cantidad), P.str('Motivo', 300, motivo), P.int('IDUsuario', actor)])).rows[0]!;
  },
};
