import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from '../auth/RequireRole';
import { useAuth } from '../auth/AuthContext';
import { AdminLayout } from '../components/layout/AdminLayout';
import { ShopLayout } from '../components/layout/ShopLayout';
import { FullPageSpinner } from '../components/ui/feedback';
import { CartPage } from '../features/carrito/CartPage';
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { DireccionesPage } from '../features/cuenta/DireccionesPage';
import { LoginPage, RegisterPage } from '../features/cuenta/AuthPages';
import { MisPedidosPage, PedidoClientePage } from '../features/pedidos/PedidosCliente';
import { CatalogPage } from '../features/tienda/CatalogPage';
import { ProductPage } from '../features/tienda/ProductPage';

// El panel interno se carga bajo demanda: los clientes no descargan ese codigo
const DashboardPage = lazy(() => import('../features/admin/DashboardPage'));
const PedidosAdminPage = lazy(() => import('../features/admin/PedidosAdminPage'));
const PedidoAdminPage = lazy(() => import('../features/admin/PedidoAdminPage'));
const InventarioPage = lazy(() => import('../features/admin/InventarioPage'));

function AdminHome() {
  const { user } = useAuth();
  return <Navigate to={user?.rol === 'Administrador' ? '/admin/dashboard' : '/admin/pedidos'} replace />;
}

function NotFound() {
  return <div className="center"><h1>404</h1><p className="muted">La pagina que busca no existe.</p></div>;
}

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<ShopLayout />}>
          <Route index element={<CatalogPage />} />
          <Route path="producto/:id" element={<ProductPage />} />
          <Route path="carrito" element={<CartPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="registro" element={<RegisterPage />} />
          <Route element={<RequireRole roles={['Cliente']} />}>
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="pedidos" element={<MisPedidosPage />} />
            <Route path="pedidos/:id" element={<PedidoClientePage />} />
            <Route path="cuenta/direcciones" element={<DireccionesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="admin" element={<RequireRole roles={['Operador', 'Administrador']} />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route element={<RequireRole roles={['Administrador']} />}>
              <Route path="dashboard" element={<DashboardPage />} />
            </Route>
            <Route path="pedidos" element={<PedidosAdminPage />} />
            <Route path="pedidos/:id" element={<PedidoAdminPage />} />
            <Route path="inventario" element={<InventarioPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
