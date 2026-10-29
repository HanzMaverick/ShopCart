import { Router } from 'express';
import { authenticate, authorize, currentUser } from '../middleware/auth';
import { usuariosService } from '../services/usuarios.service';
import { bitacoraService } from '../services/inventario.service';
import { idParams } from '../validators/common';
import { bitacoraQuery, crearUsuarioBody, estadoUsuarioBody, listarUsuariosQuery } from '../validators/schemas';

export const usuariosRouter = Router();
usuariosRouter.use(authenticate, authorize('Administrador'));

usuariosRouter.get('/', async (req, res) => {
  res.json(await usuariosService.listar(listarUsuariosQuery.parse(req.query)));
});

usuariosRouter.post('/', async (req, res) => {
  const u = await usuariosService.crear(crearUsuarioBody.parse(req.body), currentUser(req).idUsuario);
  res.status(201).json(u);
});

usuariosRouter.patch('/:id/estado', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { activo } = estadoUsuarioBody.parse(req.body);
  res.json(await usuariosService.cambiarEstado(id, activo, currentUser(req).idUsuario));
});

export const bitacoraRouter = Router();
bitacoraRouter.use(authenticate, authorize('Administrador'));
bitacoraRouter.get('/', async (req, res) => {
  const q = bitacoraQuery.parse(req.query);
  res.json(await bitacoraService.listar(q.modulo, q.page, q.pageSize));
});
