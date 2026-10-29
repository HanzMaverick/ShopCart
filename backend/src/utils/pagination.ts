import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Convierte filas con `totalRegistros` (COUNT(*) OVER()) en la respuesta paginada estandar. */
export function toPage<T extends { totalRegistros: number }>(rows: T[], page: number, pageSize: number): Paginated<Omit<T, 'totalRegistros'>> {
  const total = rows[0]?.totalRegistros ?? 0;
  return {
    data: rows.map(({ totalRegistros: _t, ...rest }) => rest),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
