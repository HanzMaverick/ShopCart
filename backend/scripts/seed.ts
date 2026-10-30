/**
 * Datos de demostracion para DESARROLLO (idempotente). Todo pasa por los mismos SPs y servicios que usa la API.
 * Uso: pnpm seed
 */
import { closePool } from '../src/db/pool';
import { usuariosRepository } from '../src/repositories/usuarios.repository';
import { catalogoRepository } from '../src/repositories/catalogo.repository';
import { cuponesRepository } from '../src/repositories/cupones.repository';
import { direccionesRepository } from '../src/repositories/direcciones.repository';
import { authService } from '../src/services/auth.service';

const USUARIOS = {
  admin:    { correo: 'admin@shopcart.test',    contrasena: 'Admin123!',    nombre: 'Administrador Demo' },
  operador: { correo: 'operador@shopcart.test', contrasena: 'Operador123!', nombre: 'Operador Demo' },
  cliente:  { correo: 'cliente@shopcart.test',  contrasena: 'Cliente123!',  nombre: 'Cliente Demo' },
};

async function main() {
  // --- Usuarios ---
  let admin = await usuariosRepository.obtenerPorCorreo(USUARIOS.admin.correo);
  if (!admin) {
    const hash = await authService.hashPassword(USUARIOS.admin.contrasena);
    await usuariosRepository.crearAdministradorInicial(USUARIOS.admin.correo, hash, USUARIOS.admin.nombre);
    admin = await usuariosRepository.obtenerPorCorreo(USUARIOS.admin.correo);
  }
  const idAdmin = admin!.idUsuario;

  if (!(await usuariosRepository.obtenerPorCorreo(USUARIOS.operador.correo))) {
    await usuariosRepository.crear(2, USUARIOS.operador.correo, await authService.hashPassword(USUARIOS.operador.contrasena), USUARIOS.operador.nombre, idAdmin);
  }
  if (!(await usuariosRepository.obtenerPorCorreo(USUARIOS.cliente.correo))) {
    await usuariosRepository.registrar(USUARIOS.cliente.correo, await authService.hashPassword(USUARIOS.cliente.contrasena), USUARIOS.cliente.nombre);
  }

  // --- Catalogo minimo (solo si esta vacio) ---
  const categorias = await catalogoRepository.listarCategorias(false);
  if (categorias.length === 0) {
    const ropa = await catalogoRepository.crearCategoria('Ropa', 'Prendas de vestir', idAdmin);
    const calzado = await catalogoRepository.crearCategoria('Calzado', 'Zapatos y sandalias', idAdmin);

    const camiseta = await catalogoRepository.crearProducto(ropa.idCategoria, 'Camiseta basica', 'Algodon 100%', idAdmin);
    await catalogoRepository.crearVariante(camiseta.idProducto, 'CAM-BAS-M-NEG', { talla: 'M', color: 'Negro' }, 89.9, 25, idAdmin);
    await catalogoRepository.crearVariante(camiseta.idProducto, 'CAM-BAS-L-NEG', { talla: 'L', color: 'Negro' }, 89.9, 10, idAdmin);
    await catalogoRepository.crearVariante(camiseta.idProducto, 'CAM-BAS-M-BLA', { talla: 'M', color: 'Blanco' }, 84.5, 1, idAdmin);

    const jean = await catalogoRepository.crearProducto(ropa.idCategoria, 'Jean clasico', 'Corte recto', idAdmin);
    await catalogoRepository.crearVariante(jean.idProducto, 'JEA-CLA-32', { talla: '32' }, 249, 15, idAdmin);

    const tenis = await catalogoRepository.crearProducto(calzado.idCategoria, 'Tenis urbanos', 'Suela de goma', idAdmin);
    await catalogoRepository.crearVariante(tenis.idProducto, 'TEN-URB-42', { talla: '42', color: 'Gris' }, 399, 8, idAdmin);
  }

  // --- Direccion del cliente demo y cupones de ejemplo ---
  const cliente = (await usuariosRepository.obtenerPorCorreo(USUARIOS.cliente.correo))!;
  if ((await direccionesRepository.listar(cliente.idUsuario)).length === 0) {
    await direccionesRepository.crear(cliente.idUsuario, {
      alias: 'Casa', linea1: '5a avenida 10-20 zona 1', linea2: null, ciudad: 'Guatemala', departamento: 'Guatemala', telefono: '5555-0000',
    });
  }
  if ((await cuponesRepository.listar({ page: 1, pageSize: 1 })).length === 0) {
    const vigencia = { fechaInicio: new Date('2026-01-01T00:00:00Z'), fechaFin: new Date('2027-12-31T23:59:59Z') };
    await cuponesRepository.crear({ codigo: 'BIENVENIDO10', tipo: 'Porcentaje', valor: 10, montoMinimo: 100, ...vigencia, limiteUsosTotal: 100, limiteUsosPorCliente: 1 }, idAdmin);
    await cuponesRepository.crear({ codigo: 'ROPA25', tipo: 'MontoFijo', valor: 25, montoMinimo: 0, ...vigencia, limiteUsosTotal: 50, limiteUsosPorCliente: 2, idCategoria: 1 }, idAdmin);
  }

  console.log('Seed completado. Cupones: BIENVENIDO10 (10 %, minimo Q100) y ROPA25 (Q25 en la categoria Ropa). Credenciales de DESARROLLO:');
  for (const [rol, u] of Object.entries(USUARIOS)) console.log(`  ${rol.padEnd(9)} ${u.correo}  /  ${u.contrasena}`);
}

main()
  .catch((err) => { console.error('Seed fallido:', err); process.exitCode = 1; })
  .finally(() => closePool());
