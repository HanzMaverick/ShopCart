import { direccionesRepository } from '../repositories/direcciones.repository';

export const direccionesService = {
  listar: direccionesRepository.listar,
  crear: direccionesRepository.crear,
  actualizar: direccionesRepository.actualizar,
  desactivar: direccionesRepository.desactivar,
};
