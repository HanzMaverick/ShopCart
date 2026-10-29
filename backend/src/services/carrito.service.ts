import type { CartOwner } from '../middleware/auth';
import { carritoRepository } from '../repositories/carrito.repository';

/** las reglas del carrito (existencia, cupon, totales) viven en los SPs, aquí está delgado*/
export const carritoService = {
  obtener: (o: CartOwner) => carritoRepository.obtener(o),
  agregar: (o: CartOwner, idVariante: number, cantidad: number) => carritoRepository.agregar(o, idVariante, cantidad),
  modificarCantidad: (o: CartOwner, idVariante: number, cantidad: number) => carritoRepository.modificarCantidad(o, idVariante, cantidad),
  eliminarItem: (o: CartOwner, idVariante: number) => carritoRepository.eliminarItem(o, idVariante),
  vaciar: (o: CartOwner) => carritoRepository.vaciar(o),
  aplicarCupon: (o: CartOwner, codigo: string) => carritoRepository.aplicarCupon(o, codigo),
  quitarCupon: (o: CartOwner) => carritoRepository.quitarCupon(o),
  fusionarInvitado: (idUsuario: number, token: string) => carritoRepository.fusionarInvitado(idUsuario, token),
};
