export type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED'
  | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'BUSINESS_RULE' | 'BAD_REQUEST'
  | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(message = 'No autenticado.', code: ErrorCode = 'UNAUTHORIZED') { return new AppError(401, code, message); }
  static forbidden(message = 'No tiene permisos para esta accion.') { return new AppError(403, 'FORBIDDEN', message); }
  static notFound(message = 'Recurso no encontrado.') { return new AppError(404, 'NOT_FOUND', message); }
}
