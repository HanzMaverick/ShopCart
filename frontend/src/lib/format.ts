import type { Atributos } from '../api/types';

const TZ = 'America/Guatemala';
const money = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: TZ });
const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });   // YYYY-MM-DD

export const formatQ = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `Q${money.format(n)}`);
export const formatNumber = (n: number) => new Intl.NumberFormat('es-GT').format(n);
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
/** "2026-10-01" (fecha calendario, sin zona) -> "1 oct 2026" */
export const formatCalendarDate = (ymd: string) => dateOnly.format(new Date(`${ymd}T12:00:00Z`));

export const todayISO = () => isoDate.format(new Date());
export const daysAgoISO = (days: number) => isoDate.format(new Date(Date.now() - days * 86_400_000));

export const atributosTexto = (a: Atributos | string | null | undefined): string => {
  if (!a) return '';
  const obj: Atributos = typeof a === 'string' ? (safeParse(a) ?? {}) : a;
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' · ');
};

function safeParse(s: string): Atributos | null {
  try { return JSON.parse(s) as Atributos; } catch { return null; }
}

export const precioRango = (min: number | null, max: number | null) =>
  min === null ? 'Sin precio' : max === null || max === min ? formatQ(min) : `${formatQ(min)} - ${formatQ(max)}`;

/** Quetzales abreviados para ejes de graficas: Q850, Q12.5k, Q1.2M */
export const compactQ = (n: number) => (n >= 1_000_000 ? `Q${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `Q${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `Q${Math.round(n)}`);

/** Etiqueta corta de un periodo del reporte de ventas ("2026-10-05" + Dia -> "05/10"). */
export function etiquetaPeriodo(ymd: string, agrupacion: string): string {
  const [y, m, d] = ymd.split('-');
  if (agrupacion === 'Mes') return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1] ?? m} ${y?.slice(2)}`;
  return `${d}/${m}`;
}

/* ---- Vigencias de cupones: dias calendario en hora de Guatemala (UTC-6, sin horario de verano) ---- */
export const guatemalaDate = (iso: string): string => isoDate.format(new Date(iso));            // ISO UTC -> "2026-10-31"
export const inicioDiaGuatemala = (ymd: string): string => `${ymd}T00:00:00-06:00`;              // se envia con zona explicita
export const finDiaGuatemala = (ymd: string): string => `${ymd}T23:59:59-06:00`;
