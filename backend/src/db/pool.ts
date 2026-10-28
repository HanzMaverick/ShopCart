import sql from 'mssql';
import { env } from '../config/env';

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool({
    server: env.DB_SERVER,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: env.DB_ENCRYPT, trustServerCertificate: env.DB_TRUST_SERVER_CERT, enableArithAbort: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    requestTimeout: 15_000,
  })
    .connect()
    .catch((err: unknown) => {
      poolPromise = undefined; // permite reintentar en la siguiente peticion
      throw err;
    });
  return poolPromise;
}

export async function closePool(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise.catch(() => undefined);
  poolPromise = undefined;
  await pool?.close();
}
