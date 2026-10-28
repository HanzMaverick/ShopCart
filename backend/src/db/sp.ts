import sql from 'mssql';
import { getPool } from './pool';

/**
 * Unica puerta de acceso a datos: ejecuta un stored procedure con parametros TIPADOS.
 * No existe ninguna otra forma de enviar texto SQL desde el backend.
 * Un valor `undefined` omite el parametro (el SP usa su valor por defecto); `null` envia NULL.
 */
export type SpParam = readonly [name: string, type: sql.ISqlTypeFactoryWithNoParams | sql.ISqlType, value: unknown];

export const P = {
  int:   (n: string, v: number | null | undefined): SpParam => [n, sql.Int, v],
  tiny:  (n: string, v: number | null | undefined): SpParam => [n, sql.TinyInt, v],
  bit:   (n: string, v: boolean | null | undefined): SpParam => [n, sql.Bit, v],
  str:   (n: string, len: number, v: string | null | undefined): SpParam => [n, sql.NVarChar(len), v],
  vstr:  (n: string, len: number, v: string | null | undefined): SpParam => [n, sql.VarChar(len), v],
  char:  (n: string, len: number, v: string | null | undefined): SpParam => [n, sql.Char(len), v],
  money: (n: string, v: number | null | undefined): SpParam => [n, sql.Decimal(18, 2), v],
  date:  (n: string, v: Date | null | undefined): SpParam => [n, sql.DateTime2(3), v],
  guid:  (n: string, v: string | null | undefined): SpParam => [n, sql.UniqueIdentifier, v],
  text:  (n: string, v: string | null | undefined): SpParam => [n, sql.NVarChar(sql.MAX), v],
};

export type Row = Record<string, unknown>;

export interface SpResult<T> {
  rows: T[];       // primer recordset
  sets: Row[][];   // todos los recordsets
}

/** TotalRegistros -> totalRegistros, IDProducto -> idProducto, SKU -> sku */
export function camelKey(key: string): string {
  if (/^[A-Z0-9]+$/.test(key)) return key.toLowerCase();
  const run = /^([A-Z]+)(?=[A-Z][a-z])/.exec(key);
  if (run?.[1]) return run[1].toLowerCase() + key.slice(run[1].length);
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function camelizeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camelKey(k)] = v;
  return out;
}

const DEADLOCK = 1205;      // la transaccion fue elegida como victima: se revirtio completa, es seguro reintentar
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function execSp<T = Row>(name: string, params: readonly SpParam[] = []): Promise<SpResult<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const request = (await getPool()).request();
      for (const [pname, type, value] of params) {
        if (value !== undefined) request.input(pname, type, value);
      }
      const result = await request.execute<Row>(name);
      const sets = (result.recordsets as unknown as Row[][]).map((rs) => Array.from(rs, camelizeRow));
      return { rows: (sets[0] ?? []) as T[], sets };
    } catch (err) {
      const isDeadlock = err instanceof sql.RequestError && err.number === DEADLOCK;
      if (!isDeadlock || attempt >= MAX_RETRIES) throw err;
      await sleep(25 * 2 ** attempt + Math.random() * 25);   // espera creciente con jitter
    }
  }
}

/** Los campos JSON (Atributos, ValorAnterior...) vuelven como texto desde SQL Server. */
export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}
