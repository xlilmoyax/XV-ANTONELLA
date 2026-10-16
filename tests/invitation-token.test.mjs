import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';

globalThis.crypto ??= webcrypto;

const source = await readFile(resolve('supabase/functions/_shared/invitation-token.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tokenModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const invitationId = '4dc63ed6-3f74-4f48-9ec0-b760a3bd7162';
const signingSecret = 'test-only-signing-secret-with-at-least-32-bytes';
const expiredAt = new Date(Date.now() - 60_000).toISOString();
const futureAt = new Date(Date.now() + 60_000).toISOString();

test('signed invitation token validates the invitation identity and expiration only', async () => {
  const token = await tokenModule.signInvitation(invitationId, futureAt, signingSecret);
  const [header, payload] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

  assert.deepEqual(await tokenModule.verifyInvitation(token, signingSecret), {
    id: invitationId,
    exp: Math.floor(Date.parse(futureAt) / 1000),
  });
  assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')).alg, 'HS256');
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iss', 'sub']);
});

test('tampered, expired, malformed, or differently signed invitation tokens are rejected', async () => {
  const token = await tokenModule.signInvitation(invitationId, futureAt, signingSecret);
  const [header, payload, signature] = token.split('.');
  const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(await tokenModule.verifyInvitation(`${header}.${changedPayload}.${signature}`, signingSecret), null);
  assert.equal(await tokenModule.verifyInvitation(token, `${signingSecret}-wrong`), null);
  assert.equal(await tokenModule.verifyInvitation(await tokenModule.signInvitation(invitationId, expiredAt, signingSecret), signingSecret), null);
  assert.equal(await tokenModule.verifyInvitation('not-a-token', signingSecret), null);
  assert.equal(await tokenModule.verifyInvitation(42, signingSecret), null);
});

test('weak signing secrets and invalid invitation ids cannot issue a token', async () => {
  await assert.rejects(tokenModule.signInvitation(invitationId, futureAt, 'short'));
  await assert.rejects(tokenModule.signInvitation('invalid-id', futureAt, signingSecret));
});

test('public app paths require a signed invitation and use only server endpoints', async () => {
  const app = await readFile(resolve('src/App.tsx'), 'utf8');
  const hook = await readFile(resolve('src/xv/useEvent.ts'), 'utf8');
  const formA = await readFile(resolve('src/components/RsvpForm.tsx'), 'utf8');
  const formB = await readFile(resolve('src/components/CompanerosView.tsx'), 'utf8');
  const admin = await readFile(resolve('src/components/Admin.tsx'), 'utf8');
  const migration = await readFile(resolve('supabase/migrations/0003_modalidades_rsvp_seguro.sql'), 'utf8');
  const registerEdge = await readFile(resolve('supabase/functions/registrar-rsvp/index.ts'), 'utf8');
  const issueEdge = await readFile(resolve('supabase/functions/emitir-invitacion/index.ts'), 'utf8');
  const detailEdge = await readFile(resolve('supabase/functions/obtener-invitacion/index.ts'), 'utf8');
  const paymentEdge = await readFile(resolve('supabase/functions/ya-abone/index.ts'), 'utf8');

  assert.match(app, /!autorizada \|\| !modalidad/u);
  assert.match(app, /key=\{`\$\{screen\}:\$\{token \?\? ''\}`\}/u);
  assert.match(app, /h\.split\('\/'\)\[1\]/u);
  assert.match(hook, /functions\.invoke\('obtener-invitacion'/u);
  assert.doesNotMatch(hook, /\.from\('(event_settings|content_sections|gallery_images|modalidades)'/u);
  assert.match(formA, /functions\.invoke\('registrar-rsvp'/u);
  assert.match(formB, /functions\.invoke\('registrar-rsvp'/u);
  assert.match(formA, /if \(envioEnCurso\.current\) return;/u);
  assert.match(formB, /if \(envioEnCurso\.current\) return;/u);
  assert.match(admin, /Tarjeta familiar/u);
  assert.match(admin, /Tarjeta de acompañantes/u);
  assert.match(admin, /Históricos sin modalidad confirmada/u);
  assert.match(admin, /Compartilo solo con el destinatario/u);
  assert.doesNotMatch(admin, /Cada enlace es personal/u);
  assert.match(admin, /No se pudo confirmar la emisión de la invitación/u);
  assert.match(admin, /La invitación se emitió, pero no se copió ni se entregó/u);
  assert.ok(admin.indexOf("if (!actor)") < admin.indexOf('aria-label="Tarifas y clasificación"'));
  assert.doesNotMatch(formA, /rpc\('registrar_rsvp'/u);
  assert.doesNotMatch(formB, /rpc\('registrar_rsvp'/u);
  assert.match(migration, /revoke all on function registrar_rsvp\(uuid, jsonb\) from public, anon, authenticated;/u);
  assert.match(migration, /grant execute on function registrar_rsvp\(uuid, jsonb\) to service_role;/u);
  assert.match(migration, /revoke create on schema public from public, anon, authenticated;/u);
  assert.match(migration, /set search_path = pg_catalog, pg_temp[\s\S]*?from public\.admin_profiles/u);
  assert.match(migration, /revoke all on table event_settings, content_sections, gallery_images from public, anon;/u);
  assert.match(registerEdge, /verifyInvitation\(body\?\.token, SIGNING_SECRET\)/u);
  assert.doesNotMatch(registerEdge, /motivo: 'duplicado'/u);
  assert.match(issueEdge, /auth\.getUser\(\)/u);
  assert.match(issueEdge, /\.from\('admin_profiles'\)/u);
  assert.match(issueEdge, /signInvitation\(invitationId, expiresAt, SIGNING_SECRET\)/u);
  assert.match(issueEdge, /url\.hash = config\.codigo/u);
  assert.doesNotMatch(issueEdge, /searchParams\.set\('invite'/u);
  assert.match(detailEdge, /verifyInvitation\(token, SIGNING_SECRET\)/u);
  assert.match(detailEdge, /modality\.codigo === 'companeros'/u);
  assert.match(paymentEdge, /rpc\('registrar_aviso_pago'/u);
  assert.doesNotMatch(paymentEdge, /String\(e\)/u);
  assert.match(migration, /revoke all on function registrar_aviso_pago\(text\) from public, anon, authenticated;/u);
});
