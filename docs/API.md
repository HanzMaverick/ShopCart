# ShopCart API - referencia

Base (ruta completa): `http://localhost:3000/api/<ruta>` · JSON · UTF-8.
**Autenticacion:** `Authorization: Bearer <accessToken>` (JWT 15 min). Renovar con `POST /auth/refresh` (el refresh token rota en cada uso).
**Errores:** `{ "error": { "code", "message", "details?" } }` · 401 sin/expirado token (`TOKEN_EXPIRED`) · 403 sin permiso · 404 no existe o es de otro cliente · 409 conflicto · 422 validacion/regla de negocio · 503 BD no disponible.
**Paginacion:** `?page=1&pageSize=20` (max 100) -> `{ data: [...], pagination: { page, pageSize, total, totalPages } }`.
**Cabeceras especiales:** `X-Cart-Token` (carrito de invitado, UUID) · `Idempotency-Key` (UUID, obligatoria en `/checkout/pagar`).

Roles: **P** publico · **C** Cliente · **O** Operador · **A** Administrador.

## Auth
| Metodo y ruta | Rol | Cuerpo / notas |
|---|---|---|
| POST `/auth/register` | P | `{ correo, contrasena, nombre }` -> sesion |
| POST `/auth/login` | P | `{ correo, contrasena }` -> `{ accessToken, refreshToken, usuario }` |
| POST `/auth/refresh` | P | `{ refreshToken }` -> nueva sesion (rotacion) |
| POST `/auth/logout` | P | `{ refreshToken }` -> 204 |
| GET `/auth/me` | autenticado | perfil |

## Tienda (catalogo publico, solo activos)
| Ruta | Query |
|---|---|
| GET `/tienda/categorias` | - |
| GET `/tienda/productos` | `texto, idCategoria, precioMin, precioMax, soloDisponibles, ordenarPor=Nombre\|Precio\|Recientes, direccion, page, pageSize` |
| GET `/tienda/productos/:id` | producto + variantes + imagenes |

## Carrito (P con `X-Cart-Token`, o C)
| Metodo y ruta | Cuerpo |
|---|---|
| GET `/carrito` | devuelve carrito con totales (`subtotal, descuento, total, montoIVA`), lineas y `tokenInvitado` |
| POST `/carrito/items` | `{ idVariante, cantidad }` (suma a lo existente; valida existencia disponible) |
| PATCH `/carrito/items/:idVariante` | `{ cantidad }` |
| DELETE `/carrito/items/:idVariante` · DELETE `/carrito` | quitar linea / vaciar |
| POST `/carrito/cupon` · DELETE `/carrito/cupon` | `{ codigo }` (un cupon por carrito; mensaje especifico si se rechaza) |
| POST `/carrito/fusionar` | C: `{ tokenInvitado }` tras iniciar sesion |

## Direcciones (C) · `/direcciones`
GET, POST `{ alias, linea1, linea2?, ciudad, departamento, telefono }`, PUT `/:id`, DELETE `/:id` (desactiva).

## Checkout (C)
| Ruta | Descripcion |
|---|---|
| POST `/checkout/iniciar` | reserva la existencia 15 min -> `{ fechaExpira, minutosReserva, items }`. 422 si falta existencia |
| POST `/checkout/pagar` | header `Idempotency-Key`; `{ idDireccion, metodoPago: Tarjeta\|Transferencia\|Efectivo, totalEsperado? }` -> **201** pedido nuevo / **200** reintento (`repetida: true`). 409 si el total cambio o la clave se reuso con otro contenido |

## Pedidos
| Ruta | Rol | Descripcion |
|---|---|---|
| GET `/pedidos/mis` | C | propios; `idEstadoPedido, desde, hasta, ordenarPor, direccion, page` |
| GET `/pedidos` | O, A | todos; ademas `cliente` (nombre/correo) |
| GET `/pedidos/transiciones` | O, A | estados y transiciones permitidas |
| GET `/pedidos/:id` | C (solo suyo) / O, A | detalle, lineas, historial, pagos, devoluciones |
| POST `/pedidos/:id/cancelar` | C | solo propio y antes de despachar |
| PATCH `/pedidos/:id/estado` | O, A | `{ idEstadoNuevo, comentario? }` (1 Pagado, 2 EnPreparacion, 3 Despachado, 4 Entregado, 5 Cancelado) |
| POST `/pedidos/:id/devoluciones` | O, A | `{ motivo, lineas: [{ idPedidoDetalle, cantidad }] }` |

## Cupones (A) · `/cupones`
GET (filtros `busqueda, activo, soloVigentes`), GET `/:id`, POST/PUT `{ codigo, tipo: Porcentaje|MontoFijo, valor, montoMinimo, fechaInicio, fechaFin, limiteUsosTotal, limiteUsosPorCliente, idCategoria? }` (PUT agrega `activo`), PATCH `/:id/estado`.

## Inventario (O, A) · `/inventario`
GET (`texto, idCategoria, umbralBajo`), GET `/variantes/:id/kardex` (`tipo, desde, hasta`), POST `/variantes/:id/entradas` `{ cantidad, motivo }`, POST `/variantes/:id/ajustes` `{ cantidad (+/-), motivo }`.

## Administracion (A)
`/admin/categorias`, `/admin/productos`, `/admin/productos/:id/variantes`, `/admin/variantes/:id` (+ `/precio`, `/estado`), `/admin/imagenes`, `/usuarios`, `GET /bitacora?modulo=`.

## Reportes (A) · `/reportes`
Fechas en hora de Guatemala (`YYYY-MM-DD`, inclusivas; por defecto ultimos 30 dias). Todas devuelven `meta` (rango efectivo) y los datos. Solo cuentan pedidos no Cancelados ni DevueltoTotal; se descuentan devoluciones.
| Ruta | Parametros | Respuesta |
|---|---|---|
| GET `/reportes/resumen` | `desde, hasta, horasAbandono=24` | `{ meta, resumen: { pedidos, ventasBrutas, devoluciones, ventasNetas, ticketPromedio, unidadesVendidas, clientesConCompra, carritosAbandonados, valorCarritosAbandonados } }` |
| GET `/reportes/ventas` | `agrupacion=Dia\|Semana\|Mes, desde, hasta` | `{ meta, data: [{ periodo, pedidos, ventasBrutas, devoluciones, ventasNetas, ticketPromedio }] }` (periodos vacios en cero) |
| GET `/reportes/categorias` | `desde, hasta` | `{ meta, data: [{ categoria, unidades, ventasNetas, pedidos }] }` |
| GET `/reportes/top-productos` | `desde, hasta, top=10 (max 50)` | `{ meta, data: [{ producto, categoria, unidades, ventasNetas }] }` |
| GET `/reportes/pedidos-por-estado` | `desde, hasta` | `{ meta, data: [{ estado, pedidos, monto }] }` (incluye cancelados y devueltos) |
| GET `/reportes/carritos-abandonados` | `horas=24, page, pageSize` | `{ horas, valorTotal, data, pagination }` |

## Sistema
GET `/health` -> `{ status: "ok", db: "up" }`.
