import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const script = await readFile(resolve('apps-script/CorreosXV-modalidades.gs'), 'utf8');
let sends = 0;
let gmailFailure = null;
const context = {
  Logger: { log() {} },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null }),
  },
  GmailApp: {
    sendEmail: () => {
      sends += 1;
      if (gmailFailure) throw gmailFailure;
    },
  },
  MailApp: { getRemainingDailyQuota: () => 100 },
  Utilities: { formatDate: () => '2026-10-14' },
};
vm.createContext(context);
vm.runInContext(script, context);

const familia = {
  modalidad: {
    codigo: 'familia_amigos',
    precio_tarjeta: 70000,
    edad_minima_paga: 10,
    permite_acompanantes: true,
  },
  cantidad_adultos: 2,
  cantidad_menores: 1,
  attendees: [
    { es_titular: true, edad_al_evento: 35 },
    { es_titular: false, edad_al_evento: 9 },
    { es_titular: false, edad_al_evento: 10 },
  ],
  importe_estimado: 140000,
};

test('GAS accepts only a validated family total with the minor exemption', () => {
  assert.equal(context.calcularImporteValidado(familia, 'familia_amigos'), 140000);
  assert.equal(context.calcularImporteValidado({ ...familia, importe_estimado: 210000 }, 'familia_amigos'), null);
  assert.equal(
    context.calcularImporteValidado({
      ...familia,
      attendees: familia.attendees.map((a) => ({ ...a, edad_al_evento: null })),
    }, 'familia_amigos'),
    null,
  );
});

test('GAS charges one companion 40000 and rejects extra attendees', () => {
  const invitado = {
    modalidad: {
      codigo: 'companeros',
      precio_tarjeta: 40000,
      edad_minima_paga: null,
      permite_acompanantes: false,
    },
    cantidad_adultos: 0,
    cantidad_menores: 1,
    attendees: [{ es_titular: true, edad_al_evento: 8 }],
    importe_estimado: 40000,
  };
  assert.equal(context.calcularImporteValidado(invitado, 'companeros'), 40000);
  assert.equal(context.calcularImporteValidado({ ...invitado, attendees: [...invitado.attendees, {}] }, 'companeros'), null);
});

test('GAS dry-run and disabled sending cannot send to a recipient', () => {
  const cfg = context.CFG();
  assert.equal(cfg.DRY, true);
  assert.equal(cfg.ENVIAR, false);
  assert.equal(context.filtrarDestinatariosDePrueba(cfg, [{ email: 'test@example.test' }]).lista.length, 0);
  assert.equal(context.enviarSeguro(cfg, 'test@example.test', 'test', 'test'), 'simulado');
  assert.equal(sends, 0);
});

test('GAS test mode permits exactly one valid recipient and excludes everyone else before writes', () => {
  const c = { DRY: false, ENVIAR: true, TEST: ['test@example.test'] };
  const candidates = [
    { email: 'test@example.test' },
    { email: 'guest@example.test' },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.filtrarDestinatariosDePrueba(c, candidates))),
    { lista: [candidates[0]], omitidos: 1 },
  );
  assert.equal(context.filtrarDestinatariosDePrueba({ ...c, TEST: [...c.TEST, 'second@example.test'] }, candidates).lista.length, 0);
  assert.throws(() => context.enviarSeguro(
    { ...c, TEST: [...c.TEST, 'second@example.test'] },
    'test@example.test',
    'test',
    'test',
  ));
});

test('GAS treats unique-key conflicts as duplicates but surfaces other Supabase failures', () => {
  const originalSb = context.sb;
  const payload = { guest_id: 'guest-1', idempotencia_clave: 'bienvenida:guest-1' };
  try {
    context.sb = () => [{ id: 'log-1' }];
    assert.equal(context.registrarAviso(payload), 'log-1');
    context.sb = () => { throw new Error('Supabase 409: duplicate key violates email_logs_idempotencia_clave_key'); };
    assert.equal(context.registrarAviso(payload), null);
    context.sb = () => { throw new Error('Supabase 503: database unavailable'); };
    assert.throws(() => context.registrarAviso(payload), /503/);
  } finally {
    context.sb = originalSb;
  }
});

test('GAS keeps Gmail outcomes pending when the send or its status update is uncertain', () => {
  const originalSb = context.sb;
  const c = { DRY: false, ENVIAR: true, TEST: ['test@example.test'], MAX: 1 };
  const guest = {
    id: 'guest-1',
    nombre_apellido: 'Prueba Uno',
    email: 'test@example.test',
    modalidad_id: 'mod-1',
    modalidad: familia.modalidad,
    cantidad_adultos: 2,
    cantidad_menores: 1,
    importe_estimado: 140000,
    attendees: familia.attendees,
  };
  let logs = [];
  let patchFailure = false;
  let patchBodies = [];
  let postCount = 0;
  const mockSupabase = (path, method, body) => {
    if (method === 'GET' && path.startsWith('guests?')) return [guest];
    if (method === 'GET' && path.startsWith('email_logs?')) return logs;
    if (method === 'POST' && path === 'email_logs') {
      postCount += 1;
      logs = [{ guest_id: guest.id, estado: 'pendiente' }];
      return [{ id: 'log-1' }];
    }
    if (method === 'PATCH') {
      patchBodies.push(body);
      if (patchFailure) throw new Error('Supabase 503 after Gmail');
      logs[0] = { guest_id: guest.id, estado: body.estado };
      return [{ id: 'log-1' }];
    }
    throw new Error('Unexpected mocked Supabase request: ' + method + ' ' + path);
  };
  try {
    context.sb = mockSupabase;
    gmailFailure = new Error('Gmail network result unknown');
    let result = context.procesarBienvenidasMod(c, 'mod-1', 'familia_amigos', {
      clave: 'agradecimiento',
      asunto: 'Hola [Nombre]',
      cuerpo: 'Gracias [Nombre] [Importe]',
    }, 'https://example.test/#invitacion');
    assert.equal(result.inciertos, 1);
    assert.equal(logs[0].estado, 'pendiente');
    assert.match(patchBodies[0].error, /Resultado de Gmail incierto/);

    gmailFailure = null;
    logs = [];
    patchBodies = [];
    patchFailure = true;
    result = context.procesarBienvenidasMod(c, 'mod-1', 'familia_amigos', {
      clave: 'agradecimiento',
      asunto: 'Hola [Nombre]',
      cuerpo: 'Gracias [Nombre] [Importe]',
    }, 'https://example.test/#invitacion');
    assert.equal(result.inciertos, 1);
    assert.equal(patchBodies.length, 1);
    assert.equal(patchBodies[0].estado, 'enviado');
    assert.equal(postCount, 2);

    patchFailure = false;
    const sendsBefore = sends;
    result = context.procesarBienvenidasMod(c, 'mod-1', 'familia_amigos', {
      clave: 'agradecimiento',
      asunto: 'Hola [Nombre]',
      cuerpo: 'Gracias [Nombre] [Importe]',
    }, 'https://example.test/#invitacion');
    assert.equal(result.revisados, 0);
    assert.equal(sends, sendsBefore);
    assert.equal(postCount, 2);
  } finally {
    gmailFailure = null;
    context.sb = originalSb;
  }
});

test('GAS reminder pass sends only validated modality totals and requires a 10-day interval', () => {
  const originalSb = context.sb;
  const c = { DRY: false, ENVIAR: true, TEST: ['test@example.test'], MAX: 10 };
  const valid = {
    ...familia,
    id: 'valid-family',
    nombre_apellido: 'Prueba Familia',
    email: 'test@example.test',
    modalidad_id: 'mod-1',
    modalidad: familia.modalidad,
    asistencia: 'confirmado',
    estado_pago: 'pendiente_pago',
  };
  const historical = {
    ...valid,
    id: 'historic',
    modalidad_id: null,
    modalidad: null,
  };
  let postGuestIds = [];
  let eventInterval = 10;
  let previousLogs = [];
  context.sb = (path, method, body) => {
    if (method === 'GET' && path.startsWith('event_settings?')) {
      return [{
        fecha_limite_pago: '2026-12-10',
        recordatorio_cada_dias: eventInterval,
        recordatorios_activos: true,
      }];
    }
    if (method === 'GET' && path.startsWith('guests?')) return [historical, valid];
    if (method === 'GET' && path.startsWith('email_logs?')) return previousLogs;
    if (method === 'POST' && path === 'email_logs') {
      postGuestIds.push(body.guest_id);
      previousLogs = [{ guest_id: body.guest_id, estado: 'pendiente' }];
      return [{ id: 'reminder-log' }];
    }
    if (method === 'PATCH') {
      previousLogs = [{ guest_id: valid.id, estado: body.estado, enviado_at: body.enviado_at }];
      return [{ id: 'reminder-log' }];
    }
    throw new Error('Unexpected mocked Supabase request: ' + method + ' ' + path);
  };
  const sendsBefore = sends;
  try {
    const result = context.procesarRecordatoriosMod(c, 'mod-1', 'familia_amigos', {
      clave: 'recordatorio_pago',
      asunto: 'Recordatorio [Importe]',
      cuerpo: 'Hola [Nombre], [Importe]',
    }, 'https://example.test/#invitacion');
    assert.equal(result.enviados, 1);
    assert.deepEqual(postGuestIds, ['valid-family']);
    assert.equal(sends, sendsBefore + 1);

    eventInterval = 9;
    postGuestIds = [];
    const blocked = context.procesarRecordatoriosMod(c, 'mod-1', 'familia_amigos', {
      clave: 'recordatorio_pago',
      asunto: 'Recordatorio',
      cuerpo: 'Hola',
    }, 'https://example.test/#invitacion');
    assert.equal(blocked.motivo, 'pausado-o-intervalo-invalido');
    assert.deepEqual(postGuestIds, []);
    assert.equal(sends, sendsBefore + 1);
  } finally {
    context.sb = originalSb;
  }
});

test('GAS manual recovery requires a confirmed failure and permits one test-recipient retry', () => {
  const originalSb = context.sb;
  const originalCfg = context.CFG;
  const c = { DRY: false, ENVIAR: true, TEST: ['test@example.test'], BASE: 'https://example.test' };
  const guest = {
    ...familia,
    id: 'recoverable-guest',
    nombre_apellido: 'Prueba Recuperación',
    email: 'test@example.test',
    modalidad_id: 'mod-1',
    asistencia: 'confirmado',
  };
  const previo = {
    id: 'failed-log',
    guest_id: guest.id,
    tipo: 'agradecimiento',
    destinatario: guest.email,
    asunto: 'Antiguo',
    estado: 'fallido',
    intentos: 1,
    idempotencia_clave: 'agradecimiento:' + guest.id,
    modalidad_id: 'mod-1',
  };
  let currentState = 'fallido';
  let manualAttemptExists = false;
  let retryPosts = 0;
  let sendCalls = 0;
  context.CFG = () => c;
  context.sb = (path, method, body) => {
    if (method === 'GET' && path.includes('estado=eq.fallido')) {
      return currentState === 'fallido' ? [previo] : [];
    }
    if (method === 'GET' && path.includes('idempotencia_clave=eq.')) {
      return manualAttemptExists ? [{ id: 'manual-log' }] : [];
    }
    if (method === 'GET' && path.startsWith('guests?')) return [guest];
    if (method === 'GET' && path.startsWith('email_templates?')) {
      return [{
        clave: 'agradecimiento',
        asunto: 'Hola [Nombre]',
        cuerpo: 'Hola [Nombre]: [Importe]',
        modalidad_id: 'mod-1',
      }];
    }
    if (method === 'POST' && path === 'email_logs') {
      retryPosts += 1;
      manualAttemptExists = true;
      currentState = 'pendiente';
      return [{ id: 'manual-log' }];
    }
    if (method === 'PATCH') {
      currentState = body.estado;
      return [{ id: 'manual-log' }];
    }
    throw new Error('Unexpected mocked Supabase request: ' + method + ' ' + path);
  };
  const originalSendEmail = context.GmailApp.sendEmail;
  context.GmailApp.sendEmail = () => { sendCalls += 1; };
  try {
    currentState = 'pendiente';
    assert.throws(() => context.recuperarAvisoFallido(
      'failed-log',
      'CONFIRMO_NO_ENTREGADO',
      'Confirmación de destinatario de prueba',
    ), /solo se puede recuperar/i);
    assert.equal(sendCalls, 0);

    currentState = 'fallido';
    const result = context.recuperarAvisoFallido(
      'failed-log',
      'CONFIRMO_NO_ENTREGADO',
      'Confirmación de destinatario de prueba',
    );
    assert.equal(result.ok, true);
    assert.equal(retryPosts, 1);
    assert.equal(sendCalls, 1);
    assert.equal(currentState, 'enviado');

    currentState = 'fallido';
    assert.throws(() => context.recuperarAvisoFallido(
      'failed-log',
      'CONFIRMO_NO_ENTREGADO',
      'Confirmación de destinatario de prueba',
    ), /ya tuvo un reintento manual/i);
    assert.equal(retryPosts, 1);
    assert.equal(sendCalls, 1);
  } finally {
    context.CFG = originalCfg;
    context.sb = originalSb;
    context.GmailApp.sendEmail = originalSendEmail;
  }
});
