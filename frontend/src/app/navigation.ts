import type { Rol } from '../api/types';

export interface NavItem { to: string; label: string; roles: Rol[] }

/** Menu del panel interno: cada rol ve solo lo que puede usar (el backend lo vuelve a validar)*/
export const adminNav: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', roles: ['Administrador'] },
  { to: '/admin/pedidos', label: 'Pedidos', roles: ['Operador', 'Administrador'] },
  { to: '/admin/inventario', label: 'Inventario', roles: ['Operador', 'Administrador'] },
  { to: '/admin/productos', label: 'Productos', roles: ['Administrador'] },
  { to: '/admin/categorias', label: 'Categorias', roles: ['Administrador'] },
  { to: '/admin/cupones', label: 'Cupones', roles: ['Administrador'] },
  { to: '/admin/usuarios', label: 'Usuarios', roles: ['Administrador'] },
  { to: '/admin/bitacora', label: 'Bitacora', roles: ['Administrador'] },
];
