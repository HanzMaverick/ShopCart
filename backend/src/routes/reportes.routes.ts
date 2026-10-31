import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { reportesService } from '../services/reportes.service';
import {
  carritosAbandonadosQuery, reporteRangoQuery, reporteResumenQuery, reporteTopQuery, reporteVentasQuery,
} from '../validators/schemas';

/** RF-08: solo el Administrador consulta reportes. Fechas en hora local de Guatemala (YYYY-MM-DD, inclusivas). */
export const reportesRouter = Router();
reportesRouter.use(authenticate, authorize('Administrador'));

reportesRouter.get('/resumen', async (req, res) => {
  const { horasAbandono, ...rango } = reporteResumenQuery.parse(req.query);
  res.json(await reportesService.resumen(rango, horasAbandono));
});

reportesRouter.get('/ventas', async (req, res) => {
  const { agrupacion, ...rango } = reporteVentasQuery.parse(req.query);
  res.json(await reportesService.ventas(rango, agrupacion));
});

reportesRouter.get('/categorias', async (req, res) => { res.json(await reportesService.porCategoria(reporteRangoQuery.parse(req.query))); });

reportesRouter.get('/top-productos', async (req, res) => {
  const { top, ...rango } = reporteTopQuery.parse(req.query);
  res.json(await reportesService.topProductos(rango, top));
});

reportesRouter.get('/pedidos-por-estado', async (req, res) => { res.json(await reportesService.pedidosPorEstado(reporteRangoQuery.parse(req.query))); });

reportesRouter.get('/carritos-abandonados', async (req, res) => {
  const q = carritosAbandonadosQuery.parse(req.query);
  res.json(await reportesService.carritosAbandonados(q.horas, q.page, q.pageSize));
});
