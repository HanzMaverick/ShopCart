import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './db/pool';
import { iniciarJobReservas } from './jobs/reservas.job';
import { eventos } from './services/eventos.service';

const server = createApp().listen(env.PORT, () => {
  console.log(`ShopCart API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

const detenerJob = iniciarJobReservas();

async function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando...`);
  detenerJob();
  eventos.cerrarTodo();     // cierra los canales SSE abiertos para que server.close() termine
  server.close(async () => { await closePool(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
