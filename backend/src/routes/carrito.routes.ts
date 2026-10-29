import { Router } from 'express';
import { authenticate, authorize, currentUser, resolveCartOwner, type CartOwner } from '../middleware/auth';
import { carritoService } from '../services/carrito.service';
import { cantidadBody, cuponCodigoBody, fusionarBody, idVarianteParams, itemBody } from '../validators/schemas';

export const carritoRouter = Router();

const owner = (req: Parameters<typeof currentUser>[0]): CartOwner => req.cartOwner ?? {};

/* Fusion tras el login: requiere sesion de Cliente*/
carritoRouter.post('/fusionar', authenticate, authorize('Cliente'), async (req, res) => {
  const { tokenInvitado } = fusionarBody.parse(req.body);
  res.json(await carritoService.fusionarInvitado(currentUser(req).idUsuario, tokenInvitado));
});

/* Invitado (X-Cart-Token) o Cliente autenticado*/
carritoRouter.use(resolveCartOwner);

carritoRouter.get('/', async (req, res) => { res.json(await carritoService.obtener(owner(req))); });

carritoRouter.post('/items', async (req, res) => {
  const b = itemBody.parse(req.body);
  res.status(201).json(await carritoService.agregar(owner(req), b.idVariante, b.cantidad));
});

carritoRouter.patch('/items/:idVariante', async (req, res) => {
  const { idVariante } = idVarianteParams.parse(req.params);
  res.json(await carritoService.modificarCantidad(owner(req), idVariante, cantidadBody.parse(req.body).cantidad));
});

carritoRouter.delete('/items/:idVariante', async (req, res) => {
  res.json(await carritoService.eliminarItem(owner(req), idVarianteParams.parse(req.params).idVariante));
});

carritoRouter.delete('/', async (req, res) => { res.json(await carritoService.vaciar(owner(req))); });

carritoRouter.post('/cupon', async (req, res) => {
  res.json(await carritoService.aplicarCupon(owner(req), cuponCodigoBody.parse(req.body).codigo));
});
carritoRouter.delete('/cupon', async (req, res) => { res.json(await carritoService.quitarCupon(owner(req))); });
