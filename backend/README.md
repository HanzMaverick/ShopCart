# ShopCart - Backend

Express + TypeScript (strict) sobre SQL Server. **Todo acceso a datos es por stored procedures** con parametros tipados (`src/db/sp.ts` es la unica puerta; no hay SQL en el backend ni ORM).

## Puesta en marcha
1. Ejecutar los scripts: `cd ../database && DB_SERVER=localhost DB_USER=sa DB_PASSWORD='***' ./run_all.sh` (o correr `001`..`008` en orden con SSMS / Azure Data Studio).
2. `cp .env.example .env` y completar `DB_USER`, `DB_PASSWORD` y `JWT_ACCESS_SECRET` (min. 32 caracteres).
3. `pnpm install --frozen-lockfile` y luego `pnpm seed` (usuarios y catálogo de demostración, idempotente).
4. `pnpm dev` -> http://localhost:3000/api/health

Requisitos: Node 24 LTS y pnpm 12 (`corepack enable` o `npm i -g pnpm`; el campo `packageManager` fija la version).

Credenciales de desarrollo (seed): `admin@shopcart.test / Admin123!`, `operador@shopcart.test / Operador123!`, `cliente@shopcart.test / Cliente123!`.

## Capas
`routes` (HTTP + validacion zod) -> `services` (orquestacion) -> `repositories` (llaman SPs) -> SQL Server. `jobs/` libera las reservas vencidas cada `RESERVAS_JOB_SEGUNDOS`.
Errores: los SPs usan `THROW 50010..50014` y `errorHandler` los traduce (404/409/422/403/401). Formato: `{ "error": { "code", "message", "details?" } }`.

## Endpoints
Referencia completa en [`../docs/API.md`](../docs/API.md). Arquitectura y estado del proyecto en [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md).

## Pruebas
- `pnpm typecheck`: compilacion estricta.
- `pnpm test`: pruebas del tiempo real (bus de eventos y canal SSE de extremo a extremo, sin base de datos).
- `pnpm concurrencia`: con la API y la BD en marcha (y `pnpm seed` ejecutado). Verifica con varias peticiones simultaneas: (A) la ultima unidad la obtiene un solo cliente, (B) 5 pagos con la misma `Idempotency-Key` crean un solo pedido, (C) un cupon de un solo uso lo consigue un solo cliente. Para no chocar con el limite de intentos de `/auth`, arrancar la API con `RATE_LIMIT_AUTH_POR_MINUTO=1000`.

## Decisiones tecnicas
- **bcryptjs** (JS puro, sin compilacion nativa) con costo 12. Contrasena de 8-72 caracteres (limite de bcrypt).
- **Sesiones**: access JWT HS256 de 15 min + refresh token opaco (hash SHA-256 en BD) con rotacion y deteccion de reutilizacion por familia. El refresh va en el cuerpo JSON; mejora posible: cookie httpOnly + proteccion CSRF.
- **`authenticate` consulta al usuario en cada peticion** (busqueda por PK): una cuenta desactivada o un cambio de rol aplica al instante, aunque el JWT siga vigente.
- Login con comparacion bcrypt contra hash falso si el correo no existe (evita enumeracion por timing) y rate limit en `/auth/*` (extra).
- Los montos viajan como `number` solo de paso; todo calculo monetario ocurre en SQL (DECIMAL).

## Gestion de dependencias y seguridad (pnpm)
- **pnpm** en lugar de npm: estricto con dependencias no declaradas, y desde pnpm 10 **no ejecuta scripts de instalacion** de terceros salvo los aprobados. Unico aprobado: `esbuild` (lo usa `tsx`) en `allowBuilds` de `pnpm-workspace.yaml`. `bcryptjs` es JS puro: no necesita compilar nada.
- **Versiones exactas** (`saveExact`) y `pnpm-lock.yaml` versionado. Instalacion reproducible con `--frozen-lockfile`.
- **`minimumReleaseAge: 10080`** (7 dias): pnpm rechaza versiones recien publicadas. En la practica bloqueo `mssql@12.7.13` y `dotenv@18.0.9` (publicadas dias antes) y se fijaron `12.7.10` y `18.0.8`.
- **`pnpm audit`** revisado el 27-oct-2026; hallazgos y tratamiento:
  | Paquete | Hallazgo | Tratamiento |
  |---|---|---|
  | `zod` 3.25.x | consumo de memoria con colecciones grandes | actualizado a `zod@4.6.7` |
  | `@azure/msal-node` (via mssql > tedious) | fuga de parametros en flujo Azure AD | `overrides` a `7.1.0`; solo aplica a autenticacion Azure AD, aqui se usa login SQL |
  | `body-parser` 2.3.0 (via express) | DoS con bytes extra tras cuerpo comprimido | `overrides` a `2.4.0` (ya cumple la antiguedad minima); ademas `express.json({ inflate: false })` rechaza cuerpos comprimidos (415) |

## Tiempo real (SSE)
`GET /api/eventos/stream` (sesion requerida) abre un canal Server-Sent Events. El servidor **solo avisa** (`pedido.creado`, `pedido.estado`, `pedido.devolucion`, con ids y estado; nunca montos ni datos personales) y el cliente vuelve a consultar la API. Un Cliente recibe unicamente los eventos de SUS pedidos; Operador y Administrador reciben todos. El canal se cierra al expirar el access token (el cliente reconecta y renueva la sesion) y envia un latido cada 25 s. Los eventos se publican desde los servicios tras completarse la operacion y nunca hacen fallar la peticion. Limite: bus en memoria = una sola instancia del backend (con varias haria falta Redis pub/sub). `pnpm test` cubre el bus y el canal de extremo a extremo.

## Concurrencia y checkout
- `execSp` reintenta hasta 3 veces (con espera creciente) si SQL Server elige la transaccion como victima de un interbloqueo (error 1205); es seguro porque la transaccion se revirtio completa.
- `POST /checkout/pagar` exige `Idempotency-Key`; el backend manda ademas el SHA-256 del contenido para detectar claves reutilizadas con otra solicitud. La pasarela de pago esta simulada (ver `checkout.service.ts`).
- El dueno del carrito sale del JWT (Cliente) o de `X-Cart-Token` (invitado); ningun endpoint recibe un id de carrito.
