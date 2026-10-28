import type { ErrorRequestHandler, RequestHandler } from 'express';
import sql from 'mssql';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from '../errors/AppError';
import { env } from '../config/env';

/** Codigos que lanzan los stored procedures con THROW */
const SQL_MAP: Record<number, [number, ErrorCode]> = {
  50010: [404, 'NOT_FOUND'],
  50011: [409, 'CONFLICT'],
  50012: [422, 'BUSINESS_RULE'],
  50013: [403, 'FORBIDDEN'],
  50014: [401, 'UNAUTHORIZED'],
  50001: [422, 'BUSINESS_RULE'],   // transicion de estado invalida (trigger)
  1205:  [503, 'SERVICE_UNAVAILABLE'], // interbloqueo que persistio tras los reintentos
  547:   [409, 'CONFLICT'],        // violacion de FK/CHECK no controlada
  2601:  [409, 'CONFLICT'],
  2627:  [409, 'CONFLICT'],
};

const body = (code: ErrorCode, message: string, details?: unknown) => ({ error: { code, message, ...(details ? { details } : {}) } });

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details));
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
    res.status(422).json(body('VALIDATION_ERROR', 'Los datos enviados no son validos.', details));
    return;
  }
  if (err instanceof sql.RequestError) {
    const num = err.number ?? 0;
    const mapped = SQL_MAP[num];
    if (mapped) {
      const [status, code] = mapped;
      // Los THROW 5xxxx llevan mensajes pensados para el usuario; los errores de constraint no se exponen tal cual
      const message = num >= 50000 ? err.message
        : num === 1205 ? 'El sistema esta ocupado. Intente de nuevo.'
        : 'La operación viola una restriccion de integridad.';
      res.status(status).json(body(code, message));
      return;
    }
  }
  if (err instanceof sql.ConnectionError || (err instanceof sql.RequestError && err.code === 'ETIMEOUT')) {
    console.error('[db]', err.message);
    res.status(503).json(body('SERVICE_UNAVAILABLE', 'Base de datos no disponible. Intente de nuevo en unos instantes.'));
    return;
  }
  const parseFail = err as { type?: string; status?: number };
  if (parseFail.type === 'entity.parse.failed') { res.status(400).json(body('BAD_REQUEST', 'JSON mal formado.')); return; }
  if (parseFail.type === 'entity.too.large') { res.status(413).json(body('BAD_REQUEST', 'Solicitud demasiado grande.')); return; }

  // Errores HTTP 4xx de middlewares (p. ej. body-parser: 415 por Content-Encoding no soportado)
  const httpErr = err as { status?: number; type?: string };
  if (typeof httpErr.status === 'number' && httpErr.status >= 400 && httpErr.status < 500 && httpErr.type) {
    const message = httpErr.status === 415 ? 'Codificacion de contenido no soportada.' : 'Solicitud invalida.';
    res.status(httpErr.status).json(body('BAD_REQUEST', message));
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json(body('INTERNAL_ERROR', env.isProd ? 'Error interno del servidor.' : String((err as Error)?.message ?? err)));
};
