export const ESTADOS = [
  { id: 1, nombre: 'Pagado' }, { id: 2, nombre: 'EnPreparacion' }, { id: 3, nombre: 'Despachado' }, { id: 4, nombre: 'Entregado' },
  { id: 5, nombre: 'Cancelado' }, { id: 6, nombre: 'DevueltoParcial' }, { id: 7, nombre: 'DevueltoTotal' },
] as const;

export const ESTADO_LABEL: Record<string, string> = {
  Pagado: 'Pagado', EnPreparacion: 'En preparación', Despachado: 'Despachado', Entregado: 'Entregado',
  Cancelado: 'Cancelado', DevueltoParcial: 'Devuelto parcial', DevueltoTotal: 'Devuelto total',
};

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
export const ESTADO_TONE: Record<string, Tone> = {
  Pagado: 'info', EnPreparacion: 'primary', Despachado: 'primary', Entregado: 'success',
  Cancelado: 'danger', DevueltoParcial: 'warning', DevueltoTotal: 'warning',
};

/** Solo se puede cancelar antes de despachar (el backend y la BD lo validan igualmente). */
export const puedeCancelar = (idEstado: number) => idEstado === 1 || idEstado === 2;
export const puedeDevolver = (idEstado: number) => idEstado === 4 || idEstado === 6;
