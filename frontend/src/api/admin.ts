import { api } from './http';
import type {
  BitacoraFila, Categoria, CategoriaInput, Cupon, CuponInput, Page, ProductoAdminDetalle, ProductoBase, ProductoInput, ProductoListado, Atributos, UsuarioFila,
} from './types';
import type { FiltrosTienda } from './endpoints';

/**Endpoints de administracion (rol Administrador; el backend lo valida en cada peticion)*/
export const adminApi = {
  categorias: {
    listar: () => api<Categoria[]>('/admin/categorias'),
    crear: (b: CategoriaInput) => api<Categoria>('/admin/categorias', { method: 'POST', body: b }),
    actualizar: (id: number, b: CategoriaInput) => api<Categoria>(`/admin/categorias/${id}`, { method: 'PUT', body: b }),
    eliminar: (id: number) => api<void>(`/admin/categorias/${id}`, { method: 'DELETE' }),
  },
  productos: {
    listar: (f: FiltrosTienda) => api<Page<ProductoListado>>('/admin/productos', { query: { ...f } }),
    obtener: (id: number) => api<ProductoAdminDetalle>(`/admin/productos/${id}`),
    crear: (b: ProductoInput) => api<ProductoBase>('/admin/productos', { method: 'POST', body: b }),
    actualizar: (id: number, b: ProductoInput) => api<ProductoBase>(`/admin/productos/${id}`, { method: 'PUT', body: b }),
    cambiarEstado: (id: number, activo: boolean) => api<{ idProducto: number; activo: boolean }>(`/admin/productos/${id}/estado`, { method: 'PATCH', body: { activo } }),
    /** Con ventas, movimientos o carritos el producto solo se desactiva: el servidor responde cual de las dos cosas hizo. */
    eliminar: (id: number) => api<{ resultado: 'Eliminado' | 'Desactivado' }>(`/admin/productos/${id}`, { method: 'DELETE' }),
    agregarImagen: (id: number, url: string, orden: number) => api<{ idImagenProducto: number }>(`/admin/productos/${id}/imagenes`, { method: 'POST', body: { url, orden } }),
    eliminarImagen: (idImagen: number) => api<void>(`/admin/imagenes/${idImagen}`, { method: 'DELETE' }),
  },
  variantes: {
    crear: (idProducto: number, b: { sku: string; atributos: Atributos; precio: number; existenciaInicial: number }) =>
      api<{ idVariante: number }>(`/admin/productos/${idProducto}/variantes`, { method: 'POST', body: b }),
    actualizar: (id: number, b: { sku: string; atributos: Atributos }) => api<{ idVariante: number }>(`/admin/variantes/${id}`, { method: 'PUT', body: b }),
    cambiarPrecio: (id: number, precio: number) => api<{ idVariante: number; precio: number }>(`/admin/variantes/${id}/precio`, { method: 'PATCH', body: { precio } }),
    cambiarEstado: (id: number, activa: boolean) => api<{ idVariante: number; activa: boolean }>(`/admin/variantes/${id}/estado`, { method: 'PATCH', body: { activa } }),
  },
  cupones: {
    listar: (f: { busqueda?: string; activo?: boolean; soloVigentes?: boolean; page?: number; pageSize?: number }) => api<Page<Cupon>>('/cupones', { query: { ...f } }),
    crear: (b: CuponInput) => api<Cupon>('/cupones', { method: 'POST', body: b }),
    actualizar: (id: number, b: CuponInput & { activo: boolean }) => api<Cupon>(`/cupones/${id}`, { method: 'PUT', body: b }),
    cambiarEstado: (id: number, activo: boolean) => api<{ idCupon: number; activo: boolean }>(`/cupones/${id}/estado`, { method: 'PATCH', body: { activo } }),
  },
  usuarios: {
    listar: (f: { busqueda?: string; idRol?: number; activo?: boolean; page?: number; pageSize?: number }) => api<Page<UsuarioFila>>('/usuarios', { query: { ...f } }),
    crear: (b: { idRol: number; nombre: string; correo: string; contrasena: string }) => api<UsuarioFila>('/usuarios', { method: 'POST', body: b }),
    cambiarEstado: (id: number, activo: boolean) => api<{ idUsuario: number; activo: boolean }>(`/usuarios/${id}/estado`, { method: 'PATCH', body: { activo } }),
  },
  bitacora: {
    listar: (f: { modulo?: string; page?: number; pageSize?: number }) => api<Page<BitacoraFila>>('/bitacora', { query: { ...f } }),
  },
};
