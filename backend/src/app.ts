import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';
import { adminCatalogoRouter, tiendaRouter } from './routes/catalogo.routes';
import { carritoRouter } from './routes/carrito.routes';
import { checkoutRouter, direccionesRouter } from './routes/checkout.routes';
import { inventarioRouter } from './routes/inventario.routes';
import { cuponesRouter, pedidosRouter } from './routes/pedidos.routes';
import { bitacoraRouter, usuariosRouter } from './routes/usuarios.routes';
import { sistemaRepository } from './repositories/sistema.repository';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Cart-Token'],
    maxAge: 600,
  }));
  // inflate:false rechaza cuerpos comprimidos (415): la API solo recibe JSON pequeño y asi se cierra el vector
  // del DoS de body-parser <2.4.0 hasta que 2.4.0 cumpla la antiguedad minima de 7 dias (por si acaso).
  app.use(express.json({ limit: '100kb', inflate: false }));

  app.get('/api/health', async (_req, res) => {
    await sistemaRepository.ping();
    res.json({ status: 'ok', db: 'up' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tienda', tiendaRouter);
  app.use('/api/admin', adminCatalogoRouter);
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api/bitacora', bitacoraRouter);
  app.use('/api/inventario', inventarioRouter);
  app.use('/api/carrito', carritoRouter);
  app.use('/api/direcciones', direccionesRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/pedidos', pedidosRouter);
  app.use('/api/cupones', cuponesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
