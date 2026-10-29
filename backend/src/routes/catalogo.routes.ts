import { Router } from 'express';
import { authenticate, authorize, currentUser } from '../middleware/auth';
import { catalogoService } from '../services/catalogo.service';
import { idParams } from '../validators/common';
import {
  buscarProductosQuery, categoriaBody, estadoProductoBody, estadoVarianteBody, imagenBody, precioBody,
  productoBody, varianteActualizarBody, varianteCrearBody,
} from '../validators/schemas';

/* Tienda (publico)*/
export const tiendaRouter = Router();

tiendaRouter.get('/categorias', async (_req, res) => { res.json(await catalogoService.categoriasTienda()); });
tiendaRouter.get('/productos', async (req, res) => { res.json(await catalogoService.productosTienda(buscarProductosQuery.parse(req.query))); });
tiendaRouter.get('/productos/:id', async (req, res) => {
  res.json(await catalogoService.productoTienda(idParams.parse(req.params).id));
});

/* Administracion (solo Administrador)*/
export const adminCatalogoRouter = Router();
adminCatalogoRouter.use(authenticate, authorize('Administrador'));

const actor = (req: Parameters<typeof currentUser>[0]) => currentUser(req).idUsuario;

// Categorias
adminCatalogoRouter.get('/categorias', async (_req, res) => { res.json(await catalogoService.categoriasAdmin()); });
adminCatalogoRouter.post('/categorias', async (req, res) => {
  const b = categoriaBody.parse(req.body);
  res.status(201).json(await catalogoService.crearCategoria(b.nombre, b.descripcion, actor(req)));
});
adminCatalogoRouter.put('/categorias/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = categoriaBody.parse(req.body);
  res.json(await catalogoService.actualizarCategoria(id, b.nombre, b.descripcion, b.activa, actor(req)));
});
adminCatalogoRouter.delete('/categorias/:id', async (req, res) => {
  await catalogoService.eliminarCategoria(idParams.parse(req.params).id, actor(req));
  res.status(204).end();
});

// Productos
adminCatalogoRouter.get('/productos', async (req, res) => { res.json(await catalogoService.productosAdmin(buscarProductosQuery.parse(req.query))); });
adminCatalogoRouter.get('/productos/:id', async (req, res) => { res.json(await catalogoService.productoAdmin(idParams.parse(req.params).id)); });
adminCatalogoRouter.post('/productos', async (req, res) => {
  const b = productoBody.parse(req.body);
  res.status(201).json(await catalogoService.crearProducto(b.idCategoria, b.nombre, b.descripcion, actor(req)));
});
adminCatalogoRouter.put('/productos/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = productoBody.parse(req.body);
  res.json(await catalogoService.actualizarProducto(id, b.idCategoria, b.nombre, b.descripcion, actor(req)));
});
adminCatalogoRouter.patch('/productos/:id/estado', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await catalogoService.cambiarEstadoProducto(id, estadoProductoBody.parse(req.body).activo, actor(req)));
});
adminCatalogoRouter.delete('/productos/:id', async (req, res) => {
  // Devuelve { resultado: 'Eliminado' | 'Desactivado' }: con ventas/historial el producto solo se desactiva
  res.json(await catalogoService.eliminarProducto(idParams.parse(req.params).id, actor(req)));
});

// Imagenes
adminCatalogoRouter.post('/productos/:id/imagenes', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = imagenBody.parse(req.body);
  res.status(201).json(await catalogoService.agregarImagen(id, b.url, b.orden));
});
adminCatalogoRouter.delete('/imagenes/:id', async (req, res) => {
  await catalogoService.eliminarImagen(idParams.parse(req.params).id);
  res.status(204).end();
});

// Variantes
adminCatalogoRouter.post('/productos/:id/variantes', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = varianteCrearBody.parse(req.body);
  res.status(201).json(await catalogoService.crearVariante(id, b.sku, b.atributos, b.precio, b.existenciaInicial, actor(req)));
});
adminCatalogoRouter.put('/variantes/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const b = varianteActualizarBody.parse(req.body);
  res.json(await catalogoService.actualizarVariante(id, b.sku, b.atributos, actor(req)));
});
adminCatalogoRouter.patch('/variantes/:id/precio', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await catalogoService.cambiarPrecio(id, precioBody.parse(req.body).precio, actor(req)));
});
adminCatalogoRouter.patch('/variantes/:id/estado', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await catalogoService.cambiarEstadoVariante(id, estadoVarianteBody.parse(req.body).activa, actor(req)));
});
