import { execSp, P, type Row } from '../db/sp';

export interface Rango { desde?: Date; hasta?: Date }
export interface Meta { desde: string; hasta: string; agrupacion?: string }

const rango = (r: Rango) => [P.fecha('Desde', r.desde), P.fecha('Hasta', r.hasta)];

/** Todo reporte devuelve primero un recordset "meta" con el rango efectivamente usado y luego los datos. */
async function conMeta<T = Row>(sp: string, params: ReturnType<typeof rango>): Promise<{ meta: Meta; data: T[] }> {
  const { sets } = await execSp(sp, params);
  return { meta: sets[0]![0] as unknown as Meta, data: (sets[1] ?? []) as unknown as T[] };
}

export interface VentaPeriodo { periodo: string; pedidos: number; ventasBrutas: number; devoluciones: number; ventasNetas: number; ticketPromedio: number }
export interface ResumenDashboard {
  pedidos: number; ventasBrutas: number; devoluciones: number; ventasNetas: number; ticketPromedio: number; unidadesVendidas: number;
  clientesConCompra: number; carritosAbandonados: number; valorCarritosAbandonados: number; horasAbandono: number;
}
export interface CarritoAbandonado {
  idCarrito: number; idUsuario: number | null; cliente: string; correo: string | null; unidades: number; valor: number;
  ultimaActividad: Date; horasInactivo: number; totalRegistros: number; valorTotal: number;
}

export const reportesRepository = {
  ventas: (r: Rango, agrupacion: string) => conMeta<VentaPeriodo>('SP_Reportes_VentasPorPeriodo', [P.vstr('Agrupacion', 6, agrupacion), ...rango(r)]),

  async resumen(r: Rango, horasAbandono: number) {
    const { sets } = await execSp('SP_Reportes_Resumen', [...rango(r), P.int('HorasAbandono', horasAbandono)]);
    return { meta: sets[0]![0] as unknown as Meta, resumen: sets[1]![0] as unknown as ResumenDashboard };
  },

  porCategoria: (r: Rango) => conMeta('SP_Reportes_VentasPorCategoria', rango(r)),
  topProductos: (r: Rango, top: number) => conMeta('SP_Reportes_TopProductos', [...rango(r), P.int('Top', top)]),
  pedidosPorEstado: (r: Rango) => conMeta('SP_Reportes_PedidosPorEstado', rango(r)),

  async carritosAbandonados(horas: number, page: number, pageSize: number) {
    return (await execSp<CarritoAbandonado>('SP_Reportes_CarritosAbandonados', [
      P.int('Horas', horas), P.int('Pagina', page), P.int('TamanoPagina', pageSize)])).rows;
  },
};
