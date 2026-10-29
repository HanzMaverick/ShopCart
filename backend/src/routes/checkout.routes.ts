import { Router } from 'express';
import { AppError } from '../errors/AppError';
import { authenticate, authorize, currentUser } from '../middleware/auth';
import { checkoutService } from '../services/checkout.service';
import { direccionesService } from '../services/direcciones.service';
import { idParams } from '../validators/common';
import { direccionBody, idempotencyHeader, pagarBody } from '../validators/schemas';

export const checkoutRouter = Router();
checkoutRouter.use(authenticate, authorize('Cliente'));

/** Reserva la existencia del carrito durante 15 minutos (todo o nada)*/
checkoutRouter.post('/iniciar', async (req, res) => {
  res.json(await checkoutService.iniciar(currentUser(req).idUsuario));
});

/** Paga y crea el pedido. Requiere el header `Idempotency-Key: <uuid>`, generado por el cliente en cada intento de pago*/
checkoutRouter.post('/pagar', async (req, res) => {
  const header = req.header('idempotency-key');
  if (!header) throw new AppError(400, 'BAD_REQUEST', 'Falta el header Idempotency-Key (UUID).');
  const clave = idempotencyHeader.parse(header);
  const body = pagarBody.parse(req.body);
  const r = await checkoutService.pagar(currentUser(req).idUsuario, clave, body);
  res.status(r.repetida ? 200 : 201).json(r);
});

/* Direcciones de entrega (siempre las del usuario autenticado)*/
export const direccionesRouter = Router();
direccionesRouter.use(authenticate, authorize('Cliente'));

direccionesRouter.get('/', async (req, res) => { res.json(await direccionesService.listar(currentUser(req).idUsuario)); });
direccionesRouter.post('/', async (req, res) => {
  res.status(201).json(await direccionesService.crear(currentUser(req).idUsuario, direccionBody.parse(req.body)));
});
direccionesRouter.put('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await direccionesService.actualizar(currentUser(req).idUsuario, id, direccionBody.parse(req.body)));
});
direccionesRouter.delete('/:id', async (req, res) => {
  await direccionesService.desactivar(currentUser(req).idUsuario, idParams.parse(req.params).id);
  res.status(204).end();
});
