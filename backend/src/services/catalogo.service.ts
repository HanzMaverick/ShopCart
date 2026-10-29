import { catalogoRepository, type BusquedaProductos } from '../repositories/catalogo.repository';
import { toPage } from '../utils/pagination';

type Filtros = Omit<BusquedaProductos, 'soloActivos'>;

export const catalogoService = {
  /* Tienda (publico): solo activos, sin datos internos de inventario*/
  categoriasTienda: () => catalogoRepository.listarCategorias(true),
  async productosTienda(f: Filtros) {
    return toPage(await catalogoRepository.buscarProductos({ ...f, soloActivos: true }), f.page, f.pageSize);
  },
  productoTienda: (id: number) => catalogoRepository.obtenerProducto(id, true),

  /* Administracion */
  categoriasAdmin: () => catalogoRepository.listarCategorias(false),
  crearCategoria: catalogoRepository.crearCategoria,
  actualizarCategoria: catalogoRepository.actualizarCategoria,
  eliminarCategoria: catalogoRepository.eliminarCategoria,

  async productosAdmin(f: Filtros) {
    return toPage(await catalogoRepository.buscarProductos({ ...f, soloActivos: false }), f.page, f.pageSize);
  },
  productoAdmin: (id: number) => catalogoRepository.obtenerProducto(id, false),
  crearProducto: catalogoRepository.crearProducto,
  actualizarProducto: catalogoRepository.actualizarProducto,
  cambiarEstadoProducto: catalogoRepository.cambiarEstadoProducto,
  eliminarProducto: catalogoRepository.eliminarProducto,
  agregarImagen: catalogoRepository.agregarImagen,
  eliminarImagen: catalogoRepository.eliminarImagen,

  crearVariante: catalogoRepository.crearVariante,
  actualizarVariante: catalogoRepository.actualizarVariante,
  cambiarPrecio: catalogoRepository.cambiarPrecio,
  cambiarEstadoVariante: catalogoRepository.cambiarEstadoVariante,
};
