import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Rol } from '../api/types';
import { Card, FullPageSpinner } from '../components/ui/feedback';
import { useAuth } from './AuthContext';

/**Ruta protegida: exige sesion y (opcionalmente) uno de los roles. El backend valida igual cada peticion*/
export function RequireRole({ roles }: { roles?: Rol[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Verificando sesion..." />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.rol)) {
    return <div className="container"><Card><div className="center"><h1>403</h1><p className="muted">No tiene permisos para ver esta seccion.</p></div></Card></div>;
  }
  return <Outlet />;
}
