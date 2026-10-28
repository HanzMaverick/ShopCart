import { execSp, P, parseJson, type Row } from '../db/sp';

export interface CategoriaRow { idCategoria: number; nombre: string; descripcion: string | null; activa: boolean; totalProductos?: number }
export interface ProductoRow { idProducto: number; idCategoria: number; nombre: string; descripcion: string | null; activo: boolean }
export interface ProductoListado {
  idProducto: number; nombre: string; idCategoria: number; nombreCategoria: string; activo: boolean;
  precioMin: number | null; precioMax: number | null; existenciaDisponible: number; imagenUrl: string | null; totalRegistros: number;
}
export interface VarianteRow { idVariante: number; sku: string; atributos: unknown; precio: number; existenciaDisponible?: number; activa: boolean }

export interface BusquedaProductos {
  texto?: string; idCategoria?: number; precioMin?: number; precioMax?: number; soloDisponibles?: boolean;
  soloActivos: boolean; ordenarPor?: 'Nombre' | 'Precio' | 'Recientes'; direccion?: 'ASC' | 'DESC'; page: number; pageSize: number;
}

const withJson = <T extends Row>(row: T): T => ({ ...row, atributos: parseJson(row['atributos']) });

export const catalogoRepository = {
  /* ---- Categorias ---- */
  async listarCategorias(soloActivas: boolean) {
    return (await execSp<CategoriaRow>('SP_Categorias_Listar', [P.bit('SoloActivas', soloActivas)])).rows;
  },
  async crearCategoria(nombre: string, descripcion: string | null | undefined, actor: number) {
    return (await execSp<CategoriaRow>('SP_Categorias_Crear', [P.str('Nombre', 100, nombre), P.str('Descripcion', 500, descripcion), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async actualizarCategoria(id: number, nombre: string, descripcion: string | null | undefined, activa: boolean, actor: number) {
    return (await execSp<CategoriaRow>('SP_Categorias_Actualizar', [
      P.int('IDCategoria', id), P.str('Nombre', 100, nombre), P.str('Descripcion', 500, descripcion), P.bit('Activa', activa), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async eliminarCategoria(id: number, actor: number): Promise<void> {
    await execSp('SP_Categorias_Eliminar', [P.int('IDCategoria', id), P.int('IDUsuario', actor)]);
  },

  /* ---- Productos ---- */
  async buscarProductos(f: BusquedaProductos) {
    return (await execSp<ProductoListado>('SP_Productos_Buscar', [
      P.str('Texto', 100, f.texto), P.int('IDCategoria', f.idCategoria), P.money('PrecioMin', f.precioMin), P.money('PrecioMax', f.precioMax),
      P.bit('SoloDisponibles', f.soloDisponibles), P.bit('SoloActivos', f.soloActivos),
      P.vstr('OrdenarPor', 10, f.ordenarPor), P.vstr('Direccion', 4, f.direccion),
      P.int('Pagina', f.page), P.int('TamanoPagina', f.pageSize)])).rows;
  },
  async obtenerProducto(id: number, soloActivos: boolean) {
    const { sets } = await execSp('SP_Productos_ObtenerPorID', [P.int('IDProducto', id), P.bit('SoloActivos', soloActivos)]);
    return {
      producto: sets[0]![0] as unknown as ProductoRow & { nombreCategoria: string },
      variantes: (sets[1] ?? []).map(withJson) as unknown as VarianteRow[],
      imagenes: (sets[2] ?? []) as unknown as { idImagenProducto: number; url: string; orden: number }[],
    };
  },
  async crearProducto(idCategoria: number, nombre: string, descripcion: string | null | undefined, actor: number) {
    return (await execSp<ProductoRow>('SP_Productos_Crear', [P.int('IDCategoria', idCategoria), P.str('Nombre', 200, nombre), P.str('Descripcion', 2000, descripcion), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async actualizarProducto(id: number, idCategoria: number, nombre: string, descripcion: string | null | undefined, actor: number) {
    return (await execSp<ProductoRow>('SP_Productos_Actualizar', [P.int('IDProducto', id), P.int('IDCategoria', idCategoria), P.str('Nombre', 200, nombre), P.str('Descripcion', 2000, descripcion), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async cambiarEstadoProducto(id: number, activo: boolean, actor: number) {
    return (await execSp<{ idProducto: number; activo: boolean }>('SP_Productos_CambiarEstado', [P.int('IDProducto', id), P.bit('Activo', activo), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async eliminarProducto(id: number, actor: number) {
    return (await execSp<{ resultado: 'Eliminado' | 'Desactivado' }>('SP_Productos_Eliminar', [P.int('IDProducto', id), P.int('IDUsuario', actor)])).rows[0]!;
  },

  /* ---- Imagenes ---- */
  async agregarImagen(idProducto: number, url: string, orden: number | undefined) {
    return (await execSp('SP_ImagenesProducto_Agregar', [P.int('IDProducto', idProducto), P.str('Url', 500, url), P.tiny('Orden', orden)])).rows[0]!;
  },
  async eliminarImagen(id: number): Promise<void> {
    await execSp('SP_ImagenesProducto_Eliminar', [P.int('IDImagenProducto', id)]);
  },

  /* ---- Variantes ---- */
  async crearVariante(idProducto: number, sku: string, atributos: Record<string, string>, precio: number, existenciaInicial: number, actor: number) {
    return withJson((await execSp<Row>('SP_Variantes_Crear', [
      P.int('IDProducto', idProducto), P.str('SKU', 50, sku), P.str('Atributos', 500, JSON.stringify(atributos)),
      P.money('Precio', precio), P.int('ExistenciaInicial', existenciaInicial), P.int('IDUsuario', actor)])).rows[0]!);
  },
  async actualizarVariante(id: number, sku: string, atributos: Record<string, string>, actor: number) {
    return withJson((await execSp<Row>('SP_Variantes_Actualizar', [
      P.int('IDVariante', id), P.str('SKU', 50, sku), P.str('Atributos', 500, JSON.stringify(atributos)), P.int('IDUsuario', actor)])).rows[0]!);
  },
  async cambiarPrecio(id: number, precio: number, actor: number) {
    return (await execSp('SP_Variantes_CambiarPrecio', [P.int('IDVariante', id), P.money('PrecioNuevo', precio), P.int('IDUsuario', actor)])).rows[0]!;
  },
  async cambiarEstadoVariante(id: number, activa: boolean, actor: number) {
    return (await execSp('SP_Variantes_CambiarEstado', [P.int('IDVariante', id), P.bit('Activa', activa), P.int('IDUsuario', actor)])).rows[0]!;
  },
};
