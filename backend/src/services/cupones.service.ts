import { cuponesRepository, type CuponInput } from '../repositories/cupones.repository';
import { toPage } from '../utils/pagination';

export const cuponesService = {
  crear: (c: CuponInput, actor: number) => cuponesRepository.crear(c, actor),
  actualizar: (id: number, c: CuponInput, activo: boolean, actor: number) => cuponesRepository.actualizar(id, c, activo, actor),
  cambiarEstado: cuponesRepository.cambiarEstado,
  obtener: cuponesRepository.obtener,
  async listar(f: Parameters<typeof cuponesRepository.listar>[0]) { return toPage(await cuponesRepository.listar(f), f.page, f.pageSize); },
};
