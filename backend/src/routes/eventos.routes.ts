import { Router } from 'express';
import { authenticate, currentUser } from '../middleware/auth';
import { eventos } from '../services/eventos.service';
import { verifyAccessToken } from '../utils/tokens';

const HEARTBEAT_MS = 25_000;      // mantiene viva la conexión a través de proxies
const GRACIA_EXPIRACION_MS = 1_000;   // se cierra un instante DESPUÉS de expirar el token: la reconexion recibe 401 y renueva la sesión

export const eventosRouter = Router();

/**
 * Canal SSE (Server-Sent Events) de tiempo real. Requiere sesion (Authorization: Bearer; el navegador lo consume con fetch + stream,
 * no con EventSource, para no exponer el token en la URL). Cliente: solo eventos de sus pedidos. Operador/Administrador: todos.
 * La conexión se cierra cuando expira el access token: el cliente reconecta y, al recibir 401, renueva la sesión con el refresh token.
 */
eventosRouter.get('/stream', authenticate, (req, res) => {
  const user = currentUser(req);
  const { exp } = verifyAccessToken((req.headers.authorization ?? '').slice(7));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n');
  res.write(`event: conectado\ndata: ${JSON.stringify({ rol: user.rol })}\n\n`);

  const off = eventos.suscribir({ idUsuario: user.idUsuario, rol: user.rol }, (e) => {
    res.write(`event: ${e.tipo}\ndata: ${JSON.stringify(e)}\n\n`);
  });
  const olvidar = eventos.registrarConexion(res);
  const latido = setInterval(() => res.write(': latido\n\n'), HEARTBEAT_MS);
  const msRestantes = exp > 0 ? exp * 1000 - Date.now() + GRACIA_EXPIRACION_MS : 10 * 60_000;
  const vencimiento = setTimeout(() => res.end(), Math.max(500, msRestantes));

  const limpiar = () => { clearInterval(latido); clearTimeout(vencimiento); off(); olvidar(); };
  req.on('close', limpiar);
  res.on('error', limpiar);
});
