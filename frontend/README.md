## Estructura
```
src/
├── main.tsx · app/            punto de entrada, rutas (App.tsx) y menu por rol (navigation.ts)
├── api/                       http.ts (cliente + renovacion de token) · session.ts · endpoints.ts · types.ts · http.test.ts
├── auth/                      AuthContext (sesion) · RequireRole (rutas protegidas)
├── components/
│   ├── ui/                    Button, fields (TextField...), Modal/ConfirmDialog, Toast, DataTable, Pager, QueryPanel, feedback (Spinner, Alert, ErrorState, EmptyState...)
│   ├── layout/                ShopLayout (tienda) · AdminLayout (panel interno)
│   └── charts/                TimeSeriesChart (linea/columnas) · HBarChart (SVG/CSS, sin libreria)
├── features/                  una carpeta por area: tienda · carrito · checkout · pedidos · cuenta · admin
├── hooks/                     useUrlState (filtros en la URL) · useDebouncedValue · useCountdown
├── lib/                       format.ts (quetzales y fechas en hora de Guatemala) · errors.ts · schemas.ts (zod)
└── styles/global.css          tokens de diseno, layout y componentes (claro/oscuro, responsive)
```
**Sin logica de negocio en los componentes visuales:** los calculos (totales, descuentos, IVA, existencia, estados validos) los hace el backend; el frontend solo muestra y envia.
