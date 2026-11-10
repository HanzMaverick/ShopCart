/** Pruebas del bus de eventos en tiempo real: quien recibe que, y limpieza de conexiones*/
import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { eventos, puedeVer, type EventoEmitido, type EventoNegocio } from './eventos.service';

const evento = (idUsuario: number): EventoNegocio => ({ tipo: 'pedido.estado', idPedido: 1, numeroPedido: 'SC-00000001', idUsuario, idActor: 99, idEstadoPedido: 3, estado: 'Despachado' });

afterEach(() => eventos.cerrarTodo());

describe('visibilidad por rol', () => {
  it('un Cliente solo ve eventos de sus pedidos; Operador y Administrador ven todos', () => {
    assert.equal(puedeVer({ idUsuario: 7, rol: 'Cliente' }, evento(7)), true);
    assert.equal(puedeVer({ idUsuario: 7, rol: 'Cliente' }, evento(8)), false);
    assert.equal(puedeVer({ idUsuario: 1, rol: 'Operador' }, evento(8)), true);
    assert.equal(puedeVer({ idUsuario: 2, rol: 'Administrador' }, evento(8)), true);
  });
});

describe('bus de eventos', () => {
  it('entrega a cada suscriptor solo lo que puede ver y agrega la marca de tiempo', () => {
    const recibidos: Record<string, EventoEmitido[]> = { c7: [], c8: [], op: [] };
    eventos.suscribir({ idUsuario: 7, rol: 'Cliente' }, (e) => recibidos['c7']!.push(e));
    eventos.suscribir({ idUsuario: 8, rol: 'Cliente' }, (e) => recibidos['c8']!.push(e));
    eventos.suscribir({ idUsuario: 1, rol: 'Operador' }, (e) => recibidos['op']!.push(e));
    eventos.publicar(evento(7));
    assert.equal(recibidos['c7']!.length, 1);
    assert.equal(recibidos['c8']!.length, 0, 'otro cliente NO debe enterarse');
    assert.equal(recibidos['op']!.length, 1);
    assert.ok(recibidos['c7']![0]!.ts);
  });

  it('despues de desuscribirse ya no recibe', () => {
    let n = 0;
    const off = eventos.suscribir({ idUsuario: 1, rol: 'Operador' }, () => { n++; });
    eventos.publicar(evento(5)); off(); eventos.publicar(evento(5));
    assert.equal(n, 1);
    assert.equal(eventos.totalSuscriptores(), 0);
  });

  it('un suscriptor que falla no impide avisar a los demas ni lanza error', () => {
    let ok = 0;
    eventos.suscribir({ idUsuario: 1, rol: 'Operador' }, () => { throw new Error('conexion caida'); });
    eventos.suscribir({ idUsuario: 2, rol: 'Administrador' }, () => { ok++; });
    assert.doesNotThrow(() => eventos.publicar(evento(5)));
    assert.equal(ok, 1);
  });

  it('cerrarTodo termina las conexiones abiertas (apagado ordenado)', () => {
    let cerradas = 0;
    const fake = { end: () => { cerradas++; } } as unknown as ServerResponse;
    eventos.registrarConexion(fake);
    eventos.cerrarTodo();
    assert.equal(cerradas, 1);
  });
});
