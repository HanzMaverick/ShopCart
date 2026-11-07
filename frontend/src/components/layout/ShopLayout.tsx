import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../../auth/AuthContext';
import { useCart } from '../../features/carrito/useCart';
import { Button } from '../ui/Button';

export function ShopLayout() {
  const { user, status, isStaff, logout } = useAuth();
  const { data: cart } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const units = cart?.totalUnidades ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" onClick={close}>Shop<span>Cart</span></Link>
          <Button className="burger" variant="secondary" size="sm" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>Menu</Button>
          <nav className={`nav collapsible grow${open ? ' open' : ''}`} aria-label="Principal">
            <NavLink to="/" end onClick={close}>Tienda</NavLink>
            {user?.rol === 'Cliente' && <NavLink to="/pedidos" onClick={close}>Mis pedidos</NavLink>}
            {user?.rol === 'Cliente' && <NavLink to="/cuenta/direcciones" onClick={close}>Direcciones</NavLink>}
            {isStaff && user && <NavLink to={homeFor(user.rol)} onClick={close}>Panel interno</NavLink>}
            <span className="grow" />
            {!isStaff && (
              <NavLink to="/carrito" className="cart-link" onClick={close} aria-label={`Carrito, ${units} unidades`}>
                Carrito{units > 0 && <span className="cart-count">{units}</span>}
              </NavLink>
            )}
            {status !== 'loading' && !user && (
              <>
                <NavLink to="/login" onClick={close}>Ingresar</NavLink>
                <NavLink to="/registro" onClick={close}>Crear cuenta</NavLink>
              </>
            )}
            {user && (
              <>
                <span className="muted small hidden-sm">{user.nombre}</span>
                <Button size="sm" variant="secondary" onClick={() => { close(); void logout().then(() => navigate('/')); }}>Salir</Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <footer className="footer">ShopCart Derechos reservados</footer>
    </>
  );
}
