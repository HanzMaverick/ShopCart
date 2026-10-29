import { Router } from 'express';
import { authenticate, authorize, currentUser } from '../middleware/auth';
import { cuponesService } from '../services/cupones.service';
import { pedidosService } from '../services/pedidos.service';
import { idParams } from '../validators/common';
import {
  cancelarBody, cuponActualizarBody, cuponCrearBody, devolucionBody, estadoCuponBody, estadoPedidoBody,
  listarCuponesQuery, listarPedidosQuery,
} from '../validators/schemas';

/* Pedidos*/
export const pedidosRouter = Router();
pedidosRouter.use(authenticate);

// Rutas fijas ANTES de /:id
pedidosRouter.get('/mis', authorize('Cliente'), async (req, res) => {
  const { cliente: _c, ...q } = listarPedidosQuery.parse(req.query);
  res.json(await pedidosService.misPedidos(currentUser(req), q));
});

pedidosRouter.get('/transiciones', authorize('Operador', 'Administrador'), async (_req, res) => {
  res.json(await pedidosService.transiciones());
});

pedidosRouter.get('/', authorize('Operador', 'Administrador'), async (req, res) => {
  res.json(await pedidosService.listar(listarPedidosQuery.parse(req.query)));
});

// Cliente: solo sus pedidos (404 si es ajeno). Operador/Administrador: cualquiera
pedidosRouter.get('/:id', async (req, res) => {
  res.json(await pedidosService.detalle(currentUser(req), idParams.parse(req.params).id));
});

pedidosRouter.post('/:id/cancelar', authorize('Cliente'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await pedidosService.cancelarPropio(currentUser(req), id, cancelarBody.parse(req.body ?? {}).comentario));
});

pedidosRouter.patch('/:id/estado', authorize('Operador', 'Administrador'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = estadoPedidoBody.parse(req.body);
  res.json(await pedidosService.cambiarEstado(currentUser(req), id, b.idEstadoNuevo, b.comentario));
});

pedidosRouter.post('/:id/devoluciones', authorize('Operador', 'Administrador'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = devolucionBody.parse(req.body);
  res.status(201).json(await pedidosService.devolver(currentUser(req), id, b.motivo, b.lineas));
});

/* Cupones (Administrador)*/
export const cuponesRouter = Router();
cuponesRouter.use(authenticate, authorize('Administrador'));

cuponesRouter.get('/', async (req, res) => { res.json(await cuponesService.listar(listarCuponesQuery.parse(req.query))); });
cuponesRouter.get('/:id', async (req, res) => { res.json(await cuponesService.obtener(idParams.parse(req.params).id)); });
cuponesRouter.post('/', async (req, res) => {
  res.status(201).json(await cuponesService.crear(cuponCrearBody.parse(req.body), currentUser(req).idUsuario));
});
cuponesRouter.put('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { activo, ...cupon } = cuponActualizarBody.parse(req.body);
  res.json(await cuponesService.actualizar(id, cupon, activo, currentUser(req).idUsuario));
});
cuponesRouter.patch('/:id/estado', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await cuponesService.cambiarEstado(id, estadoCuponBody.parse(req.body).activo, currentUser(req).idUsuario));
});
