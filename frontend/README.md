# ShopCart - Frontend

React 19 + TypeScript (strict) + Vite. Consume la API del backend (`../docs/API.md`). Gestor de paquetes: **pnpm**.

## Puesta en marcha
```bash
cd frontend
pnpm install --frozen-lockfile
cp .env.example .env        # opcional: en desarrollo el proxy de Vite envia /api a http://localhost:3000
pnpm dev                    # http://localhost:5173  (el backend debe estar en marcha)
pnpm test                   # pruebas: cliente HTTP (renovacion de token, invitado, errores) y validaciones/fechas (16 pruebas)
pnpm build                  # tsc estricto + build de produccion en dist/
```
Credenciales de prueba y cupones: ver el README principal.

## Pantallas y control por rol
| Ruta | Rol | Contenido |
|---|---|---|
| `/` · `/producto/:id` | publico | Catalogo (busqueda, categoria, precio, disponibilidad, orden, paginacion en el servidor) y detalle con variantes |
| `/carrito` | invitado o Cliente | Lineas, cantidades, cupon, totales, IVA incluido |
| `/login` · `/registro` | publico | Formularios validados; el carrito de invitado se fusiona al ingresar |
| `/checkout` | Cliente | Direccion, metodo de pago, reserva de 15 min con cuenta regresiva y pago idempotente |
| `/pedidos` · `/pedidos/:id` | Cliente | Historial con filtros/orden/paginacion, detalle, cancelacion |
| `/cuenta/direcciones` | Cliente | CRUD de direcciones |
| `/admin/dashboard` | Administrador | KPIs, ventas por dia/semana/mes, categorias, top 10, estados, carritos abandonados |
| `/admin/pedidos` · `/admin/pedidos/:id` | Operador, Administrador | Gestion de pedidos, cambio de estado (solo transiciones validas), devoluciones por linea |
| `/admin/inventario` | Operador, Administrador | Existencias, kardex, entradas y ajustes |
| `/admin/productos` · `/admin/productos/:id` | Administrador | Listado con filtros/orden/paginacion; alta, edicion, activar/desactivar y eliminacion (si tiene historial solo se desactiva); variantes (SKU, atributos, precio con su propio flujo, estado) e imagenes |
| `/admin/categorias` | Administrador | CRUD; una categoria con productos o cupones no se elimina |
| `/admin/cupones` | Administrador | CRUD con vigencia por dias en hora de Guatemala, limites total y por cliente, categoria opcional |
| `/admin/usuarios` | Administrador | Alta de Operadores/Administradores y desactivacion (cierra sus sesiones) |
| `/admin/bitacora` | Administrador | Registro de solo lectura con filtro por modulo y comparacion antes/despues |

Los menus se construyen por rol (`src/app/navigation.ts`) y las rutas se protegen con `RequireRole`; **el backend vuelve a validar cada peticion** (el frontend solo mejora la experiencia).

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

## Decisiones tecnicas
| Tema | Decision |
|---|---|
| Estado del servidor | **TanStack Query**: cache, estados de carga/error/vacio en todas las vistas, reintentos solo para errores de red/5xx, `keepPreviousData` al paginar. |
| Estado de listados | En la **URL** (`useUrlState`): filtros, orden y pagina se pueden compartir, el boton "atras" funciona y se conservan al recargar. Todo ocurre del lado del servidor. |
| Sesion | Access token **solo en memoria**; refresh token en `localStorage` (sobrevive recargas). Riesgo conocido (XSS); mejora posible: cookie `httpOnly` + proteccion CSRF. |
| Renovacion transparente | `api/http.ts`: ante 401 renueva y **reintenta la peticion**. El refresh token rota, por eso la renovacion es de **una sola vez** (promesa compartida + Web Locks entre pestanas). Una falla de red no cierra la sesion; un refresh invalido si. Cubierto con pruebas (`pnpm test`). |
| Carrito de invitado | Token en `localStorage` enviado como `X-Cart-Token` solo en `/carrito` y sin sesion; se fusiona al iniciar sesion. |
| Pago idempotente | Una `Idempotency-Key` por intento de pago, guardada en `sessionStorage`: un reintento (falla de red, recarga) reutiliza la **misma** clave y el servidor devuelve el mismo pedido; se renueva al terminar o ante un rechazo. El boton se bloquea mientras se envia. Se manda `totalEsperado` para detectar cambios de precio. |
| Reserva | El estado de la reserva se **deriva del carrito** (`reservaExpira`), no de estado local: sobrevive a recargas. Cuenta regresiva con `useCountdown`. |
| Formularios | react-hook-form + zod con mensajes en espanol; los errores 422 del servidor se llevan a cada campo (`applyServerErrors`). Atributos de variantes con filas dinamicas (`useFieldArray`). Las vigencias de cupones se envian con zona explicita (`-06:00`). |
| Graficas | SVG/CSS propios (`components/charts`): cero dependencias extra, accesibles (`role="img"`, titulo) y con tooltip. |
| Dependencias | Solo 8 de ejecucion (7 + la fuente). pnpm con versiones exactas, antiguedad minima de 7 dias y scripts de instalacion bloqueados (`pnpm-workspace.yaml`). `pnpm audit`: sin vulnerabilidades. |
| Tema y marca | Una sola paleta clara de marca, definida con variables CSS al inicio de `src/styles/global.css` (azul institucional, rojo de acento, estados). Se retiro el modo oscuro automatico para no mezclar paletas; cambiar la identidad visual es editar ese bloque. |
| Tipografia | Montserrat autoalojada con `@fontsource-variable/montserrat` (sin peticiones a terceros; lleva tambien el control de versiones y auditoria de pnpm). |
| Notificaciones | Arriba a la derecha, grandes, con icono y color solido; se cierran con la X o solas (5 s; los errores 9 s) y se pausan al pasar el cursor. Los avisos en linea (`Alert`) llevan icono y borde de color. |
| Accesibilidad | Etiquetas asociadas, `aria-invalid`/`aria-describedby`, `aria-live` en avisos, `aria-sort` en tablas, foco y Escape en modales, navegacion por teclado. |
| Rendimiento | Panel interno en carga diferida (`React.lazy`): el cliente no descarga ese codigo. |
