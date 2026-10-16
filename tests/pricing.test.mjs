import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(resolve('src/xv/pricing.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pricing = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('family pricing exempts only ages below 10', () => {
  assert.deepEqual(
    pricing.calcularImporteModalidad('familia_amigos', [34, 9, 10], 2, 1, 70000, 10),
    { importe: 140000, personasQueAbonan: 2, error: null },
  );
});

test('family pricing charges each registered adult', () => {
  assert.equal(pricing.calcularImporteModalidad('familia_amigos', [24, 31], 2, 0, 70000, 10).importe, 140000);
});

test('companions charge 40000 regardless of age and reject companions', () => {
  assert.equal(pricing.calcularImporteModalidad('companeros', [8], 0, 1, 40000, null).importe, 40000);
  assert.match(
    pricing.calcularImporteModalidad('companeros', [25, 14], 1, 1, 40000, null).error,
    /una sola persona/,
  );
});

test('unknown, unclassified, incomplete, and mismatched compositions are rejected', () => {
  assert.ok(pricing.calcularImporteModalidad(null, [20], 1, 0, 70000, 10).error);
  assert.ok(pricing.calcularImporteModalidad('familiares', [20], 1, 0, 70000, 10).error);
  assert.ok(pricing.calcularImporteModalidad('familia_amigos', [null], 1, 0, 70000, 10).error);
  assert.ok(pricing.calcularImporteModalidad('familia_amigos', [20], 0, 0, 70000, 10).error);
});
