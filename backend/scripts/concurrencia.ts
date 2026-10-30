/**
 * Prueba de concurrencia contra la API en ejecucion (pnpm seed antes);
 *  A) ultima unidad: N clientes intentan reservar 1 unidad a la vez -> exactamente 1 gana, nunca hay sobreventa.
 *  B) idempotencia: el ganador paga 5 veces en paralelo con la misma clave -> 1 pedido, 1 cobro.
 *  C) cupon con 1 solo uso: 2 clientes lo usan a la vez -> exactamente 1 pedido con cupon.
 * Uso: pnpm concurrencia        (API_URL opcional, por defecto http://localhost:3000/api)
 */
import { randomUUID } from 'node:crypto';

const API = process.env['API_URL'] ?? 'http://localhost:3000/api';
const RUN = Date.now();
const PASS = 'Prueba123!';

interface Res { status: number; data: Record<string, any> }
async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  return { status: r.status, data: text ? (JSON.parse(text) as Record<string, any>) : {} };
}

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
  if (!ok) fallos++;
}
const cuenta = (rs: Res[], status: number) => rs.filter((r) => r.status === status).length;

async function login(correo: string, contrasena: string) {
  const r = await call('POST', '/auth/login', { body: { correo, contrasena } });
  if (r.status !== 200) throw new Error(`Login fallido para ${correo}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data['accessToken'] as string;
}

async function nuevoCliente(tag: string) {
  const reg = await call('POST', '/auth/register', { body: { correo: `conc.${RUN}.${tag}@shopcart.test`, contrasena: PASS, nombre: `Cliente ${tag}` } });
  if (reg.status !== 201) throw new Error(`Registro fallido: ${JSON.stringify(reg.data)}`);
  const token = reg.data['accessToken'] as string;
  const dir = await call('POST', '/direcciones', { token, body: { alias: 'Casa', linea1: 'Calle de prueba 123', ciudad: 'Guatemala', departamento: 'Guatemala', telefono: '5555-1234' } });
  return { token, idDireccion: dir.data['idDireccion'] as number };
}

async function productoDePrueba(admin: string, etiqueta: string, precio: number, existencia: number) {
  const cats = await call('GET', '/admin/categorias', { token: admin });
  const idCategoria = (cats.data as unknown as { idCategoria: number; activa: boolean }[]).find((c) => c.activa)!.idCategoria;
  const prod = await call('POST', '/admin/productos', { token: admin, body: { idCategoria, nombre: `Producto prueba ${etiqueta} ${RUN}` } });
  const v = await call('POST', `/admin/productos/${prod.data['idProducto']}/variantes`, {
    token: admin, body: { sku: `TEST-${etiqueta}-${RUN}`, precio, existenciaInicial: existencia, atributos: {} },
  });
  return { idVariante: v.data['idVariante'] as number, sku: v.data['sku'] as string };
}

async function main() {
  const admin = await login('admin@shopcart.test', 'Admin123!');

  /* ===== A) Ultima unidad ===== */
  console.log('\nA) Ultima unidad con 8 clientes simultaneos');
  const ultima = await productoDePrueba(admin, 'ULT', 50, 1);
  const N = 8;
  const clientes = await Promise.all(Array.from({ length: N }, (_, i) => nuevoCliente(`A${i}`)));
  const adds = await Promise.all(clientes.map((c) => call('POST', '/carrito/items', { token: c.token, body: { idVariante: ultima.idVariante, cantidad: 1 } })));
  check('todos pueden poner la unidad en su carrito (aun no hay reserva)', cuenta(adds, 201) === N);

  const iniciar = await Promise.all(clientes.map((c) => call('POST', '/checkout/iniciar', { token: c.token })));
  check('exactamente 1 cliente reserva la unidad', cuenta(iniciar, 200) === 1, `reservas OK=${cuenta(iniciar, 200)}, rechazos 422=${cuenta(iniciar, 422)}`);
  const msg = iniciar.find((r) => r.status === 422)?.data['error']?.message;
  check('los demas reciben un mensaje claro', typeof msg === 'string' && msg.includes('existencia'), String(msg));

  /* ===== B) Idempotencia ===== */
  console.log('\nB) Idempotencia: 5 pagos paralelos con la misma Idempotency-Key');
  const ganadorIdx = iniciar.findIndex((r) => r.status === 200);
  const g = clientes[ganadorIdx]!;
  const clave = randomUUID();
  const cuerpo = { idDireccion: g.idDireccion, metodoPago: 'Tarjeta' };
  const pagos = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/checkout/pagar', { token: g.token, body: cuerpo, headers: { 'Idempotency-Key': clave } })));
  const ids = new Set(pagos.filter((p) => p.status < 300).map((p) => p.data['pedido']?.idPedido));
  check('una sola creacion (201) y el resto reintentos (200)', cuenta(pagos, 201) === 1 && cuenta(pagos, 200) === 4, `201=${cuenta(pagos, 201)}, 200=${cuenta(pagos, 200)}`);
  check('todas las respuestas apuntan al mismo pedido', ids.size === 1, [...ids].join(','));
  const otraSolicitud = await call('POST', '/checkout/pagar', { token: g.token, body: { ...cuerpo, metodoPago: 'Efectivo' }, headers: { 'Idempotency-Key': clave } });
  check('misma clave con contenido distinto -> 409', otraSolicitud.status === 409);
  const otraClave = await call('POST', '/checkout/pagar', { token: g.token, body: cuerpo, headers: { 'Idempotency-Key': randomUUID() } });
  check('otra clave sin carrito activo no duplica el pedido -> 422', otraClave.status === 422);
  const mis = await call('GET', '/pedidos/mis', { token: g.token });
  check('el cliente tiene exactamente 1 pedido', mis.data['pagination']?.total === 1, `total=${mis.data['pagination']?.total}`);

  /* ===== Integridad del inventario ===== */
  const inv = await call('GET', `/inventario?texto=${encodeURIComponent(ultima.sku)}`, { token: admin });
  const fila = inv.data['data']?.[0];
  check('existencia fisica 0 y reservada 0 (sin sobreventa)', fila?.existenciaFisica === 0 && fila?.existenciaReservada === 0, `fisica=${fila?.existenciaFisica}, reservada=${fila?.existenciaReservada}`);
  const kardex = await call('GET', `/inventario/variantes/${ultima.idVariante}/kardex`, { token: admin });
  const suma = (kardex.data['data'] as { cantidad: number }[]).reduce((a, k) => a + k.cantidad, 0);
  check('la suma del kardex coincide con la existencia', suma === fila?.existenciaFisica, `suma=${suma}`);

  /* ===== C) Cupon de un solo uso ===== */
  console.log('\nC) Cupon con limite total = 1 usado por 2 clientes a la vez');
  const producto = await productoDePrueba(admin, 'CUP', 100, 10);
  const codigo = `T${RUN}`.slice(0, 30);
  const ahora = Date.now();
  const cupon = await call('POST', '/cupones', {
    token: admin, body: { codigo, tipo: 'MontoFijo', valor: 10, montoMinimo: 0, fechaInicio: new Date(ahora - 86_400_000), fechaFin: new Date(ahora + 86_400_000), limiteUsosTotal: 1, limiteUsosPorCliente: 1 },
  });
  const pareja = await Promise.all([nuevoCliente('C0'), nuevoCliente('C1')]);
  for (const c of pareja) {
    await call('POST', '/carrito/items', { token: c.token, body: { idVariante: producto.idVariante, cantidad: 1 } });
    const ap = await call('POST', '/carrito/cupon', { token: c.token, body: { codigo } });
    if (ap.status !== 200) throw new Error(`No se pudo aplicar el cupon: ${JSON.stringify(ap.data)}`);
    await call('POST', '/checkout/iniciar', { token: c.token });
  }
  const pagosCupon = await Promise.all(pareja.map((c) => call('POST', '/checkout/pagar', {
    token: c.token, body: { idDireccion: c.idDireccion, metodoPago: 'Transferencia' }, headers: { 'Idempotency-Key': randomUUID() },
  })));
  check('exactamente 1 pedido usa el cupon', cuenta(pagosCupon, 201) === 1 && cuenta(pagosCupon, 422) === 1, `201=${cuenta(pagosCupon, 201)}, 422=${cuenta(pagosCupon, 422)}`);
  const rechazo = pagosCupon.find((p) => p.status === 422)?.data['error']?.message;
  check('el rechazado ve el motivo especifico', typeof rechazo === 'string' && rechazo.includes('agotado'), String(rechazo));
  const cuponFinal = await call('GET', `/cupones/${cupon.data['idCupon']}`, { token: admin });
  check('usosActuales = 1', cuponFinal.data['usosActuales'] === 1, `usos=${cuponFinal.data['usosActuales']}`);

  console.log(fallos === 0 ? '\nTODAS LAS VERIFICACIONES PASARON' : `\n${fallos} VERIFICACION(ES) FALLARON`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
