import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

async function compiledModule(path, replacements = {}) {
  let source = await readFile(resolve(path), 'utf8');
  for (const [before, after] of Object.entries(replacements)) {
    source = source.replaceAll(before, after);
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

const pricingUrl = `data:text/javascript;base64,${Buffer.from(
  ts.transpileModule(await readFile(resolve('src/xv/pricing.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText,
).toString('base64')}`;
const { calcularMetricas } = await compiledModule('src/xv/metricas.ts', {
  "from './pricing'": `from '${pricingUrl}'`,
});

const ajustes = { fecha_limite_pago: '', recordatorio_cada_dias: 10, recordatorios_activos: true };
const modalidades = [
  { id: 'familia-id', codigo: 'familia_amigos', precio_tarjeta: 70000, edad_minima_paga: 10 },
  { id: 'companeros-id', codigo: 'companeros', precio_tarjeta: 40000, edad_minima_paga: null },
];
const guest = (id, modalidadId, adultos, menores, importe) => ({
  id,
  nombre_apellido: id,
  email: `${id}@example.test`,
  modalidad_id: modalidadId,
  asistencia: 'confirmado',
  estado_pago: 'pendiente_pago',
  cantidad_adultos: adultos,
  cantidad_menores: menores,
  importe_estimado: importe,
});

test('metrics validate modality pricing, apply only family exemption, and block unsafe reminders', () => {
  const guests = [
    guest('family', 'familia-id', 1, 1, 70000),
    guest('companion', 'companeros-id', 0, 1, 40000),
    guest('historic', null, 2, 0, 140000),
    guest('wrong-total', 'familia-id', 1, 0, 40000),
  ];
  const attendees = [
    { guest_id: 'family', edad_al_evento: 35 },
    { guest_id: 'family', edad_al_evento: 9 },
    { guest_id: 'companion', edad_al_evento: 8 },
    { guest_id: 'historic', edad_al_evento: 30 },
    { guest_id: 'historic', edad_al_evento: 31 },
    { guest_id: 'wrong-total', edad_al_evento: 25 },
  ];

  const metrics = calcularMetricas(
    guests,
    attendees,
    [],
    [],
    [],
    [],
    ajustes,
    modalidades,
  );

  assert.equal(metrics.paganPersonas, 2);
  assert.equal(metrics.sinPagoPersonas, 2);
  assert.equal(metrics.exentos.length, 1);
  assert.equal(metrics.importePendiente, 110000);
  assert.deepEqual(
    metrics.candidatosRecordatorio.map(({ guestId }) => guestId),
    ['family', 'companion'],
  );
  assert.ok(metrics.inconsistencias.some(({ tipo, guestId }) => tipo === 'modalidad' && guestId === 'historic'));
  assert.ok(metrics.inconsistencias.some(({ tipo, guestId }) => tipo === 'importe-modalidad' && guestId === 'wrong-total'));
});
