# ShopCart - Arquitectura y organizacion (documento vivo)

Ultima actualizacion: **9 de noviembre 2026**: dashboard y estados de pedido en **tiempo real (SSE)** y correccion del filtro de precio del catalogo (script 017). Todos los requerimientos y el extra de tiempo real estan implementados.

## 1. Mapa del repositorio
```
shopcart/
├── README.md                       instalacion, decisiones, diagrama ER, diagrama de estados, credenciales
├── docs/
│   ├── ARQUITECTURA.md             este documento
│   └── API.md                      referencia de endpoints
├── database/                       scripts numerados (run_all.sh [--reset]); ejecutar SIEMPRE en orden
│   ├── 001-003  BD, tablas/indices/constraints, catalogos y triggers
│   ├── 004-008  SPs: bitacora, auth, inventario, catalogo, sistema
│   ├── 009      ajustes de esquema (migracion: Anulado, MontoReembolsado, Pago >= 0)
│   ├── 010      reservas de existencia (15 min) y liberacion
│   ├── 011      cupones + FU_Cupones_CalculoDescuento
│   ├── 012      carrito (invitado/usuario) + direcciones
│   ├── 013      SP_Pedidos_CrearPedido (atomico e idempotente)
│   ├── 014      pedidos, cambio de estado, devoluciones
│   ├── 015      reportes: VW_Dashboard_VentasPedido, FU_Dashboard_Periodo, SP_Reportes_*
│   ├── 016      semilla grande (2 000 clientes, ~9 000 variantes, 50 000 pedidos) con kardex coherente
│   └── 017      correccion del filtro de precio (SP_Productos_Buscar filtra por variante)
├── backend/                        Express 5 + TypeScript strict + pnpm
│   ├── .env.example · package.json · pnpm-lock.yaml · pnpm-workspace.yaml · tsconfig*.json
│   ├── scripts/
│   │   ├── seed.ts                 usuarios, catalogo, direccion y cupones de demostracion
│   │   └── concurrencia.ts         prueba: ultima unidad, idempotencia y cupon de un solo uso
│   └── src/
│       ├── server.ts · app.ts      arranque, middlewares globales, montaje de rutas
│       ├── config/env.ts           variables de entorno validadas con zod
│       ├── db/                     pool.ts (conexion) · sp.ts (UNICA puerta a datos: SP tipados + reintento por 1205)
│       ├── errors/AppError.ts
│       ├── middleware/             auth.ts (JWT, roles, dueno del carrito) · errorHandler.ts
│       ├── routes/                 auth · catalogo (tienda + admin) · inventario · usuarios/bitacora · eventos (SSE) ·
│       │                           carrito · checkout/direcciones · pedidos/cupones · reportes
│       ├── services/               auth · usuarios · catalogo · inventario · carrito · checkout · pedidos · cupones · direcciones · reportes · eventos (bus en memoria)
│       ├── repositories/           uno por modulo; cada metodo = un stored procedure
│       ├── validators/             common.ts · schemas.ts (zod)
│       ├── jobs/reservas.job.ts    libera reservas vencidas cada minuto
│       └── utils/                  tokens.ts · pagination.ts
└── frontend/                       React 19 + TypeScript strict + Vite + pnpm (README propio)
    ├── pnpm-workspace.yaml · package.json · vite.config.ts (proxy /api -> backend) · .env.example
    └── src/
        ├── main.tsx · app/            entrada, rutas (App.tsx) y menu por rol (navigation.ts)
        ├── api/                       http.ts (cliente + renovacion de token) · session.ts · endpoints.ts · admin.ts · stream.ts (SSE) · types.ts · pruebas (http, stream)
        ├── realtime/                  RealtimeProvider (una conexion SSE por pestana; invalida las consultas afectadas)
        ├── auth/                      AuthContext · RequireRole
        ├── components/                ui/ (Button, fields, Modal, Toast, LiveBadge, DataTable, Pager, QueryPanel, feedback) · layout/ · charts/
        ├── features/                  tienda · carrito · checkout · pedidos · cuenta · admin
        │                              admin/: Dashboard · PedidosAdmin · PedidoAdmin · Inventario · ProductosAdmin · ProductoAdmin ·
        │                                      ProductoForm · Categorias · Cupones · Usuarios · Bitacora
        ├── hooks/                     useUrlState · useDebouncedValue · useCountdown
        ├── lib/                       format · errors · schemas (zod) · schemas.test.ts
        └── styles/global.css
```

## 2. Capas y responsabilidades
| Capa | Responsabilidad | Prohibido |
|---|---|---|
| Rutas | HTTP, validacion zod, rol requerido | logica de negocio |
| Servicios | orquestacion, hash de contrasenas/solicitudes, tokens, reglas por rol | SQL |
| Repositorios | un metodo = un SP con parametros tipados | SQL, ORM |
| Stored procedures | reglas criticas, transacciones, concurrencia, auditoria | SQL dinamico concatenado |
| Triggers/CHECK | ultima defensa (transiciones, inmutabilidad, existencias) | - |

## 3. Estado por requerimiento
| RF | Modulo | BD | API | Frontend |
|---|---|---|---|---|
| 01 | Auth y roles | hecho | hecho | **hecho** (login, registro, rutas por rol, refresh transparente, usuarios) |
| 02 | Catalogo y variantes | hecho | hecho | **hecho** (tienda y administracion de productos, variantes, imagenes, categorias) |
| 03 | Inventario / kardex | hecho | hecho | **hecho** |
| 04 | Carrito | hecho | hecho | **hecho** (invitado y cliente) |
| 05 | Cupones | hecho | hecho | **hecho** (aplicacion en carrito y CRUD admin) |
| 06 | Checkout y pago | hecho | hecho | **hecho** (reserva con cuenta regresiva, pago idempotente) |
| 07 | Pedidos y devoluciones | hecho | hecho | **hecho** (cliente y panel interno) |
| 08 | Dashboard y reportes | hecho | hecho | **hecho** |
| 09 | Bitacora | hecho | hecho | **hecho** (consulta con detalle de cambios) |

Nota: el backend compila en strict y su validacion/autenticacion se probo sin base de datos; la logica de los SPs de los scripts 010 a 016 se verifica contra SQL Server con `pnpm concurrencia` y pruebas manuales (el 013 ya se ejecuto en el entorno del desarrollador).

## 4. Flujo de compra (extremo a extremo)
1. **Carrito** `/api/carrito`: invitado (header `X-Cart-Token`) o Cliente (JWT). Cada cambio libera sus reservas.
2. **Login** -> `POST /api/carrito/fusionar` pasa el carrito de invitado al usuario.
3. **Direccion** `/api/direcciones` (siempre del usuario autenticado).
4. **Iniciar pago** `POST /api/checkout/iniciar`: reserva todo el carrito 15 min o nada.
5. **Pagar** `POST /api/checkout/pagar` con `Idempotency-Key`: consume reservas, congela precios, kardex, pago, cierra carrito.
6. **Operador** `PATCH /api/pedidos/:id/estado`; **devoluciones** `POST /api/pedidos/:id/devoluciones`.
7. **Job** cada 60 s: `SP_Inventario_LiberarReservasVencidas`.

## 4b. Tiempo real (SSE)
```
Servicio (checkout / pedidos) --publicar--> bus en memoria --filtra por rol--> GET /api/eventos/stream --> RealtimeProvider --invalida--> React Query --> pantallas
```
- El servidor **solo avisa** (ids y estado, sin montos); el cliente vuelve a pedir los datos a la API, que sigue siendo la fuente de verdad y aplica permisos.
- Cliente: solo eventos de sus pedidos. Operador/Administrador: todos. Se invalida `pedidos` (todos), `inventario` (personal) y `reportes` (Administrador), con retardo de 500 ms para agrupar rafagas.
- Autenticacion con `fetch` + stream y cabecera Bearer (no `EventSource`). El canal se cierra al vencer el token y se reconecta renovando la sesion; perro guardian de 70 s; al reconectar se refresca todo.
- Limite: bus en memoria => una sola instancia del backend (con varias: Redis pub/sub).

## 5. Ciclo de vida del pedido
```mermaid
stateDiagram-v2
    [*] --> Pagado
    Pagado --> EnPreparacion
    Pagado --> Cancelado
    EnPreparacion --> Despachado
    EnPreparacion --> Cancelado
    Despachado --> Entregado
    Entregado --> DevueltoParcial
    Entregado --> DevueltoTotal
    DevueltoParcial --> DevueltoTotal
```

## 6. Convenciones y reglas de diseno
- **Nombres:** `SP_Modulo_Proceso`, `VW_`, `FU_`, llaves `IDTabla`. API en JSON camelCase (la capa `db/sp.ts` convierte `IDProducto` -> `idProducto`).
- **Errores:** SQL `THROW` 50010/50011/50012/50013/50014 -> HTTP 404/409/422/403/401; 1205 (interbloqueo) se reintenta 3 veces y, si persiste, 503. Formato `{ error: { code, message, details? } }`.
- **Dinero:** `DECIMAL(18,2)`; precios con IVA 12 % incluido (`MontoIVA = Total*12/112`); los calculos ocurren en SQL.
- **Concurrencia:** orden de bloqueo `Carrito -> Variantes (IDVariante ascendente) -> Cupon`; reserva con `UPDATE` condicionado; `XACT_ABORT ON`.
- **Idempotencia:** `UNIQUE (IDUsuario, ClaveIdempotencia)` + hash SHA-256 del contenido.
- **Seguridad:** el dueno (carrito, direcciones, pedidos) sale del JWT; ningun endpoint acepta un id de carrito; un pedido ajeno responde 404. `authenticate` recarga al usuario en cada peticion.
- **Auditoria:** escrituras de catalogo, precios, existencias, cupones y estados de pedido -> `SP_Bitacora_Registrar`; bitacora y kardex inmutables por trigger.
