/**Pruebas de las validaciones de formularios y de los helpers de fechas*/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finDiaGuatemala, guatemalaDate, inicioDiaGuatemala } from './format';
import { cuponSchema, loginSchema, paresAObjeto, registerSchema, varianteCrearSchema } from './schemas';

const mensajes = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.message));
const cuponBase = { codigo: 'ROPA25', tipo: 'MontoFijo', valor: 25, montoMinimo: 0, fechaInicio: '2026-11-01', fechaFin: '2026-11-30', limiteUsosTotal: 50, limiteUsosPorCliente: 2, idCategoria: '', activo: true } as const;

describe('formularios de acceso', () => {
  it('login exige correo valido y contraseña', () => {
    assert.ok(mensajes(loginSchema.safeParse({ correo: 'no-es-correo', contrasena: 'x' })).includes('Correo invalido.'));
    assert.ok(loginSchema.safeParse({ correo: 'a@b.co', contrasena: 'x' }).success);
  });
  it('registro valida contraseña fuerte y confirmacion', () => {
    const base = { nombre: 'Ana Perez', correo: 'ana@correo.com' };
    assert.ok(mensajes(registerSchema.safeParse({ ...base, contrasena: 'abc', confirmar: 'abc' })).includes('Minimo 8 caracteres.'));
    assert.ok(mensajes(registerSchema.safeParse({ ...base, contrasena: 'soloLetras', confirmar: 'soloLetras' })).includes('Debe incluir al menos un numero.'));
    assert.ok(mensajes(registerSchema.safeParse({ ...base, contrasena: 'Clave1234', confirmar: 'Otra12345' })).includes('Las contrasenas no coinciden.'));
    assert.ok(registerSchema.safeParse({ ...base, contrasena: 'Clave1234', confirmar: 'Clave1234' }).success);
  });
});

describe('cupones', () => {
  it('acepta un cupón valido', () => assert.ok(cuponSchema.safeParse(cuponBase).success));
  it('rechaza porcentaje mayor a 100', () => assert.ok(mensajes(cuponSchema.safeParse({ ...cuponBase, tipo: 'Porcentaje', valor: 150 })).includes('Un porcentaje no puede exceder 100.')));
  it('rechaza fin anterior al inicio y limite por cliente mayor al total', () => {
    assert.ok(mensajes(cuponSchema.safeParse({ ...cuponBase, fechaFin: '2026-10-01' })).includes('Debe ser igual o posterior al inicio.'));
    assert.ok(mensajes(cuponSchema.safeParse({ ...cuponBase, limiteUsosTotal: 1, limiteUsosPorCliente: 2 })).includes('No puede superar el limite total.'));
  });
  it('valida el código y los decimales del valor', () => {
    assert.ok(mensajes(cuponSchema.safeParse({ ...cuponBase, codigo: 'a b' })).length > 0);
    assert.ok(mensajes(cuponSchema.safeParse({ ...cuponBase, valor: 10.555 })).includes('Maximo 2 decimales.'));
  });
});

describe('variantes y atributos', () => {
  const base = { sku: 'CAM-01', precio: 89.9, existenciaInicial: 5 };
  it('ignora filas vacias y arma el objeto de atributos', () => {
    assert.deepEqual(paresAObjeto([{ clave: ' talla ', valor: 'M' }, { clave: '', valor: '' }, { clave: 'color', valor: 'Negro' }]), { talla: 'M', color: 'Negro' });
  });
  it('detecta atributos repetidos o incompletos', () => {
    const dup = varianteCrearSchema.safeParse({ ...base, atributos: [{ clave: 'talla', valor: 'M' }, { clave: 'TALLA', valor: 'L' }] });
    assert.ok(mensajes(dup).includes('Atributo repetido.'));
    assert.ok(mensajes(varianteCrearSchema.safeParse({ ...base, atributos: [{ clave: 'talla', valor: '' }] })).includes('Ingrese el valor.'));
  });
  it('exige precio positivo con maximo 2 decimales', () => {
    assert.ok(mensajes(varianteCrearSchema.safeParse({ ...base, precio: 0, atributos: [] })).includes('Debe ser mayor a cero.'));
    assert.ok(mensajes(varianteCrearSchema.safeParse({ ...base, precio: 1.234, atributos: [] })).includes('Maximo 2 decimales.'));
  });
});

describe('vigencias en hora de Guatemala', () => {
  it('convierte un dia calendario a limites con zona explicita y de vuelta al mismo dia', () => {
    assert.equal(inicioDiaGuatemala('2026-11-01'), '2026-11-01T00:00:00-06:00');
    assert.equal(finDiaGuatemala('2026-11-30'), '2026-11-30T23:59:59-06:00');
    assert.equal(guatemalaDate(new Date(inicioDiaGuatemala('2026-11-01')).toISOString()), '2026-11-01');
    assert.equal(guatemalaDate(new Date(finDiaGuatemala('2026-11-30')).toISOString()), '2026-11-30');
  });
});
