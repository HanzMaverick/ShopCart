import { inventarioRepository } from '../repositories/inventario.repository';
import { bitacoraRepository } from '../repositories/bitacora.repository';
import { toPage } from '../utils/pagination';

export const inventarioService = {
  async listar(f: Parameters<typeof inventarioRepository.listar>[0]) {
    return toPage(await inventarioRepository.listar(f), f.page, f.pageSize);
  },
  async kardex(idVariante: number, f: Parameters<typeof inventarioRepository.kardex>[1]) {
    return toPage(await inventarioRepository.kardex(idVariante, f), f.page, f.pageSize);
  },
  entrada: inventarioRepository.entrada,
  ajuste: inventarioRepository.ajuste,
};

export const bitacoraService = {
  async listar(modulo: string | undefined, page: number, pageSize: number) {
    return toPage(await bitacoraRepository.listar(modulo, page, pageSize), page, pageSize);
  },
};
