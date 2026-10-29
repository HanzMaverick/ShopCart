import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { authenticate, currentUser } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { loginBody, refreshBody, registerBody } from '../validators/schemas';

// limite de intentos en endpoints de autenticacion; (Extra opcional (por si se aparece Ultrón))
const limiter = rateLimit({
  windowMs: 60_000, limit: env.RATE_LIMIT_AUTH_POR_MINUTO, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'BAD_REQUEST', message: 'Demasiados intentos. Intente de nuevo en un minuto.' } },
});

export const authRouter = Router();

authRouter.post('/register', limiter, async (req, res) => {
  const body = registerBody.parse(req.body);
  res.status(201).json(await authService.register(body));
});

authRouter.post('/login', limiter, async (req, res) => {
  const { correo, contrasena } = loginBody.parse(req.body);
  res.json(await authService.login(correo, contrasena));
});

authRouter.post('/refresh', limiter, async (req, res) => {
  const { refreshToken } = refreshBody.parse(req.body);
  res.json(await authService.refresh(refreshToken));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = refreshBody.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  const { idUsuario, correo, nombre, rol } = currentUser(req);
  res.json({ idUsuario, correo, nombre, rol });
});
