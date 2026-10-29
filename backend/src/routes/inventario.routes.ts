import { Router } from 'express';
import { authenticate, authorize, currentUser } from '../middleware/auth';
import { inventarioService } from '../services/inventario.service';
import { idParams } from '../validators/common';
import { ajusteBody, entradaBody, kardexQuery, listarInventarioQuery } from '../validators/schemas';

export const inventarioRouter = Router();
inventarioRouter.use(authenticate, authorize('Operador', 'Administrador'));

inventarioRouter.get('/', async (req, res) => { res.json(await inventarioService.listar(listarInventarioQuery.parse(req.query))); });

inventarioRouter.get('/variantes/:id/kardex', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const q = kardexQuery.parse(req.query);
  res.json(await inventarioService.kardex(id, { tipo: q.tipo, desde: q.desde, hasta: q.hasta, page: q.page, pageSize: q.pageSize }));
});

inventarioRouter.post('/variantes/:id/entradas', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = entradaBody.parse(req.body);
  res.status(201).json(await inventarioService.entrada(id, b.cantidad, b.motivo, currentUser(req).idUsuario));
});

inventarioRouter.post('/variantes/:id/ajustes', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = ajusteBody.parse(req.body);
  res.status(201).json(await inventarioService.ajuste(id, b.cantidad, b.motivo, currentUser(req).idUsuario));
});
