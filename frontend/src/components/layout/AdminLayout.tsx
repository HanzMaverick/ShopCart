import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminNav } from '../../app/navigation';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../ui/Button';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = adminNav.filter((i) => user && i.roles.includes(user.rol));

  return (
    <div className="admin-shell">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Menu del panel">
        <Link to="/" className="brand">Shop<span>Cart</span> <small className="muted">interno</small></Link>
        <nav className="stack-sm">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className="nav-item" onClick={() => setOpen(false)}>{i.label}</NavLink>
          ))}
          <hr style={{ borderColor: 'var(--border)', width: '100%' }} />
          <Link className="nav-item" to="/" onClick={() => setOpen(false)}>Ver la tienda</Link>
        </nav>
      </aside>
      <div className="admin-main">
        <div className="admin-top">
          <Button className="burger" variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Menu</Button>
          <span className="grow" />
          <span className="muted small">{user?.nombre} · {user?.rol}</span>
          <Button size="sm" variant="secondary" onClick={() => void logout().then(() => navigate('/login'))}>Salir</Button>
        </div>
        <main className="container"><Outlet /></main>
      </div>
    </div>
  );
}
