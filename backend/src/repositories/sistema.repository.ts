import { execSp } from '../db/sp';

export const sistemaRepository = {
  async ping(): Promise<void> { await execSp('SP_Sistema_Ping'); },
};
