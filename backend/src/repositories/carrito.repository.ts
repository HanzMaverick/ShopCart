import { execSp, P, parseJson, type Row, type SpParam } from '../db/sp';
import type { CartOwner } from '../middleware/auth';

export interface CarritoCabecera {
  idCarrito: number | null; tokenInvitado: string | null; codigoCupon: string | null; cuponAviso: string | null;
  subtotal: number; descuento: number; total: number; montoIVA: number; totalUnidades: number; reservaExpira: Date | null;
}
export interface CarritoLinea {
  idVariante: number; sku: string; nombreProducto: string; atributos: unknown; imagenUrl: string | null; precioUnitario: number;
  cantidad: number; descuentoLinea: number; subtotal: number; existenciaDisponible: number; disponible: boolean;
}
export interface Carrito extends CarritoCabecera { lineas: CarritoLinea[] }

/** El dueno se envia siempre: IDUsuario (JWT) o TokenInvitado (header); jamas un IDCarrito. */
const dueno = (o: CartOwner): SpParam[] => [P.int('IDUsuario', o.idUsuario), P.guid('TokenInvitado', o.tokenInvitado)];

function mapCarrito(sets: Row[][]): Carrito {
  const cab = sets[0]?.[0] as unknown as CarritoCabecera;
  const lineas = (sets[1] ?? []).map((l) => ({ ...l, atributos: parseJson(l['atributos']) })) as unknown as CarritoLinea[];
  return { ...cab, lineas };
}

export const carritoRepository = {
  async obtener(o: CartOwner) { return mapCarrito((await execSp('SP_Carrito_Obtener', dueno(o))).sets); },
  async agregar(o: CartOwner, idVariante: number, cantidad: number) {
    return mapCarrito((await execSp('SP_Carrito_AgregarItem', [...dueno(o), P.int('IDVariante', idVariante), P.int('Cantidad', cantidad)])).sets);
  },
  async modificarCantidad(o: CartOwner, idVariante: number, cantidad: number) {
    return mapCarrito((await execSp('SP_Carrito_ModificarCantidad', [...dueno(o), P.int('IDVariante', idVariante), P.int('Cantidad', cantidad)])).sets);
  },
  async eliminarItem(o: CartOwner, idVariante: number) {
    return mapCarrito((await execSp('SP_Carrito_EliminarItem', [...dueno(o), P.int('IDVariante', idVariante)])).sets);
  },
  async vaciar(o: CartOwner) { return mapCarrito((await execSp('SP_Carrito_Vaciar', dueno(o))).sets); },
  async aplicarCupon(o: CartOwner, codigo: string) {
    return mapCarrito((await execSp('SP_Carrito_AplicarCupon', [...dueno(o), P.str('Codigo', 30, codigo)])).sets);
  },
  async quitarCupon(o: CartOwner) { return mapCarrito((await execSp('SP_Carrito_QuitarCupon', dueno(o))).sets); },
  async fusionarInvitado(idUsuario: number, tokenInvitado: string) {
    return mapCarrito((await execSp('SP_Carrito_FusionarInvitado', [P.int('IDUsuario', idUsuario), P.guid('TokenInvitado', tokenInvitado)])).sets);
  },
};
