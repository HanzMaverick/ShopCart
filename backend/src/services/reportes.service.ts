import { reportesRepository, type Rango } from '../repositories/reportes.repository';
import { toPage } from '../utils/pagination';

/**
 * Los reportes se calculan en la BD (vistas y SPs) en el momento de la consulta: "datos al momento", sin reportes manuales.
 * Reglas (README): no cuentan pedidos Cancelados ni DevueltoTotal; las devoluciones parciales se descuentan; dias en hora de Guatemala.
 */
export const reportesService = {
  ventas: (r: Rango, agrupacion: string) => reportesRepository.ventas(r, agrupacion),
  resumen: (r: Rango, horasAbandono: number) => reportesRepository.resumen(r, horasAbandono),
  porCategoria: (r: Rango) => reportesRepository.porCategoria(r),
  topProductos: (r: Rango, top: number) => reportesRepository.topProductos(r, top),
  pedidosPorEstado: (r: Rango) => reportesRepository.pedidosPorEstado(r),

  async carritosAbandonados(horas: number, page: number, pageSize: number) {
    const rows = await reportesRepository.carritosAbandonados(horas, page, pageSize);
    const pagina = toPage(rows, page, pageSize);
    return { horas, valorTotal: rows[0]?.valorTotal ?? 0, ...pagina };
  },
};
