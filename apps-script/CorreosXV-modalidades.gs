/* ============================================================
 * XV-ANTONELLA · Correos por modalidad (fuente local; no desplegar sin aprobación)
 * Requiere la migración 0003 aplicada y plantillas revisadas por modalidad.
 *
 * QUÉ CAMBIA vs el vigente:
 * - Dos pasadas separadas (familia_amigos, companeros): candidatos, plantilla y
 *   enlace siempre de la MISMA modalidad; nunca se mezclan.
 * - Detección de esquema: sin guests.modalidad_id (0003 sin aplicar) se
 *   DETIENE todo con motivo 'sin-esquema' (no envía nada).
 * - Invitados con modalidad NULL: bloqueados y contados, jamás enviados,
 *   jamás modificados (sin clasificación automática).
 * - Plantilla ausente o con cuerpo vacío: bloquea SOLO esa modalidad y lo
 *   registra; la otra sigue si está completa.
 * - DRY_RUN=true o ENVIAR_A_INVITADOS=false: envíos y escrituras bloqueados.
 * - TEST_ONLY_EMAILS debe contener exactamente el email de prueba autorizado.
 * - email_logs registra modalidad_id (auditoría e idempotencia por tarjeta;
 *   la clave sigue siendo por guest_id: cada inscripción es una fila).
 * - Token [Enlace] por modalidad (origen: enlacePara() en src/xv/modalidad.ts:
 *   base + '/#invitacion' (A) o '/#companeros' (B)). Si la plantilla no trae
 *   [Enlace], no se agrega ningún enlace (nunca uno de otra modalidad).
 *
 * SEGURIDAD (igual que el vigente + lo anterior):
 * - Sin endpoint público (sin doGet/doPost). service_role solo en Propiedades.
 * - DRY_RUN=true por defecto: CERO envíos y CERO escrituras en Supabase.
 * - Modo de prueba real: los fuera de TEST_ONLY se descartan antes de contar
 *   presupuesto y de cualquier POST (cero escrituras para ellos).
 * - Solo se escribe email_logs; guests/event_settings/templates: solo lectura.
 * - Reglas de pago intactas: solo confirmado + pendiente_pago + importe>0;
 *   informados/verificados/no-show excluidos; fecha límite y frecuencia de 10 días.
 *
 * INSTALACIÓN (cuando se autorice; usuario):
 *  1. No ejecutar ni desplegar hasta aprobar y validar migración 0003.
 *  2. Mantener DRY_RUN=true, ENVIAR_A_INVITADOS=false y TEST_ONLY_EMAILS
 *     limitado al destinatario de prueba autorizado.
 *  3. No poner service_role ni destinatarios de invitados en este archivo.
 * ============================================================ */

function CFG() {
  var p = PropertiesService.getScriptProperties();
  return {
    SB_URL: p.getProperty('SUPABASE_URL') || '',
    SB_KEY: p.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '',
    NOMBRE: p.getProperty('GMAIL_NOMBRE') || 'Antonella · Mis XV',
    BASE: (p.getProperty('SITIO_BASE') || 'https://xv-antonella.vercel.app').replace(/\/$/, ''),
    DRY: (p.getProperty('DRY_RUN') || 'true') !== 'false',
    ENVIAR: p.getProperty('ENVIAR_A_INVITADOS') === 'true',
    TEST: (p.getProperty('TEST_ONLY_EMAILS') || '')
      .split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return s.length > 0; }),
    MAX: Math.max(1, parseInt(p.getProperty('MAX_POR_EJECUCION') || '60', 10) || 60),
  };
}

function marcarAviso(logId, patch, contexto) {
  try {
    var actualizados = sb('email_logs?id=eq.' + encodeURIComponent(logId), 'PATCH', patch);
    if (!Array.isArray(actualizados) || actualizados.length !== 1 || actualizados[0].id !== logId) {
      Logger.log('Resultado de registro incierto para ' + contexto + ' (' + logId + '): PATCH sin fila confirmada.');
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('Resultado de registro incierto para ' + contexto + ' (' + logId + '): ' + e);
    return false;
  }
}

/** Reenvío manual y único: solo un log fallido, con confirmación de no entrega. */
function recuperarAvisoFallido(logId, confirmacion, motivo) {
  if (confirmacion !== 'CONFIRMO_NO_ENTREGADO' || String(motivo || '').trim().length < 10) {
    throw new Error('Se requiere confirmar no entrega y registrar un motivo de al menos 10 caracteres.');
  }
  var c = CFG();
  if (c.DRY || !c.ENVIAR || !listaPruebaValida(c)) {
    throw new Error('Recuperación bloqueada: requiere modo no-DRY, ENVIAR_A_INVITADOS=true y exactamente un email de prueba válido.');
  }
  var logs = sb(
    'email_logs?select=id,guest_id,tipo,destinatario,asunto,estado,intentos,idempotencia_clave,modalidad_id&id=eq.' +
      encodeURIComponent(logId) + '&estado=eq.fallido&limit=1',
    'GET',
  );
  var previo = logs[0];
  if (!previo || !previo.guest_id || previo.intentos >= 2 || !previo.idempotencia_clave) {
    throw new Error('Solo se puede recuperar una vez un correo fallido con invitado asociado.');
  }
  var recuperacionesPrevias = sb(
    'email_logs?select=id&guest_id=eq.' + encodeURIComponent(previo.guest_id) +
      '&tipo=eq.' + encodeURIComponent(previo.tipo) +
      '&idempotencia_clave=eq.' + encodeURIComponent(previo.idempotencia_clave + ':manual') +
      '&limit=1',
    'GET',
  );
  if (recuperacionesPrevias.length > 0) throw new Error('Este fallo ya tuvo un reintento manual.');
  if (c.TEST.indexOf(String(previo.destinatario).toLowerCase()) < 0) {
    throw new Error('El destinatario no está incluido en TEST_ONLY_EMAILS.');
  }
  if (previo.tipo !== 'agradecimiento' && previo.tipo !== 'recordatorio_pago') {
    throw new Error('Tipo de correo no recuperable.');
  }

  var gs = sb(
    'guests?select=id,nombre_apellido,email,asistencia,estado_pago,importe_estimado,modalidad_id,cantidad_adultos,cantidad_menores,modalidad:modalidades(codigo,precio_tarjeta,edad_minima_paga,permite_acompanantes),attendees(nombre,edad_al_evento,es_titular)&id=eq.' +
      encodeURIComponent(previo.guest_id) + '&limit=1',
    'GET',
  );
  var g = gs[0];
  var mod = g && (Array.isArray(g.modalidad) ? g.modalidad[0] : g.modalidad);
  if (
    !g ||
    g.email.toLowerCase() !== String(previo.destinatario).toLowerCase() ||
    g.modalidad_id !== previo.modalidad_id ||
    g.asistencia !== 'confirmado' ||
    calcularImporteValidado(g, mod && mod.codigo) === null
  ) {
    throw new Error('El invitado ya no cumple las reglas de modalidad/composición/importe.');
  }
  if (previo.tipo === 'recordatorio_pago') {
    if (g.estado_pago !== 'pendiente_pago') throw new Error('El pago ya no está pendiente.');
    var ev = sb('event_settings?select=fecha_limite_pago,recordatorio_cada_dias,recordatorios_activos&limit=1', 'GET')[0];
    var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
    if (
      !ev ||
      ev.recordatorios_activos === false ||
      Number(ev.recordatorio_cada_dias) !== 10 ||
      hoy > ev.fecha_limite_pago
    ) {
      throw new Error('Recordatorio pausado, intervalo distinto de 10 días o fuera de la fecha límite.');
    }
    var cada = 10;
    var ultimos = sb(
      'email_logs?select=enviado_at&guest_id=eq.' + encodeURIComponent(g.id) +
        '&tipo=eq.recordatorio_pago&estado=eq.enviado&order=enviado_at.desc&limit=1',
      'GET',
    );
    if (ultimos[0] && ultimos[0].enviado_at &&
        (Date.now() - new Date(ultimos[0].enviado_at).getTime()) / 86400000 < cada) {
      throw new Error('Aún no transcurrió el intervalo configurado desde el último envío.');
    }
  }

  var plantillas = sb(
    'email_templates?select=clave,asunto,cuerpo,modalidad_id,modalidad:modalidades(codigo,nombre)',
    'GET',
  );
  var tpl = plantillaPara(plantillas, baseTipo(previo.tipo === 'agradecimiento' ? 'agradecimiento' : 'recordatorio_pago'), previo.modalidad_id);
  if (!tpl) throw new Error('No existe una plantilla no vacía para esa modalidad.');
  var importe = calcularImporteValidado(g, mod.codigo);
  var base = CFG().BASE;
  var enlace = enlaceModalidad(base, mod.codigo);
  var asunto = String(tpl.asunto)
    .split('[Nombre]').join(primerNombre(g.nombre_apellido))
    .split('[Importe]').join(formatearARS(importe))
    .split('[Modalidad]').join(mod.codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
    .split('[Enlace]').join(enlace);
  var cuerpo = String(tpl.cuerpo)
    .split('[Nombre]').join(primerNombre(g.nombre_apellido))
    .split('[Importe]').join(formatearARS(importe))
    .split('[Modalidad]').join(mod.codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
    .split('[Enlace]').join(enlace);
  var nuevo = sb('email_logs', 'POST', {
    guest_id: g.id,
    modalidad_id: g.modalidad_id,
    tipo: previo.tipo,
    destinatario: g.email,
    asunto: asunto,
    estado: 'pendiente',
    intentos: 2,
    error: 'Reintento manual autorizado: ' + String(motivo).trim().slice(0, 300),
    idempotencia_clave: previo.idempotencia_clave + ':manual',
  })[0];
  if (!nuevo || !nuevo.id) throw new Error('No se pudo registrar el reintento auditado.');
  try {
    enviarSeguro(c, g.email, asunto, cuerpo);
    var registrado = marcarAviso(
      nuevo.id,
      { estado: 'enviado', enviado_at: new Date().toISOString() },
      'recuperación ' + logId,
    );
    return { ok: registrado, incierto: !registrado, log_id: nuevo.id };
  } catch (e) {
    marcarAviso(
      nuevo.id,
      {
        estado: 'pendiente',
        intentos: 2,
        error: 'Resultado de Gmail incierto; no reenviar automáticamente. ' + String(e).slice(0, 350),
      },
      'recuperación ' + logId,
    );
    Logger.log('Recuperación con resultado incierto; queda pendiente de conciliación: ' + nuevo.id);
    return { ok: false, incierto: true, log_id: nuevo.id };
  }
}

function sb(path, method, body) {
  var c = CFG();
  if (!c.SB_URL || !c.SB_KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  var r = UrlFetchApp.fetch(c.SB_URL + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: {
      apikey: c.SB_KEY,
      Authorization: 'Bearer ' + c.SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  var code = r.getResponseCode();
  var txt = r.getContentText() || '[]';
  if (code < 200 || code >= 300) throw new Error('Supabase ' + code + ': ' + txt.slice(0, 160));
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error('Supabase devolvió una respuesta JSON inválida: ' + String(e).slice(0, 160));
  }
}

function formatearARS(n) {
  var s = String(Math.max(0, Math.round(Number(n) || 0)));
  var out = '';
  while (s.length > 3) {
    out = '.' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return '$ ' + (s + out);
}

function primerNombre(full) {
  return String(full || '').trim().split(/\s+/)[0] || String(full || '');
}

/** 'agradecimiento_companeros' -> 'agradecimiento' (pura, testeable). */
function baseTipo(clave) {
  return String(clave || '').replace(/_companeros$/, '');
}

/**
 * Plantilla exacta para (tipo-base, modalidad): exige modalidad_id coincidente
 * y cuerpo no vacío. Sin correspondencia -> null (el llamador bloquea).
 */
function plantillaPara(tpls, base, modId) {
  for (var i = 0; i < tpls.length; i++) {
    var t = tpls[i] || {};
    if (baseTipo(t.clave) === base && t.modalidad_id === modId && String(t.cuerpo || '').trim() !== '') {
      return t;
    }
  }
  return null;
}

/** Null bloquea el envío: solo acepta modalidad y composición verificables. */
function calcularImporteValidado(g, codigo) {
  var modalidad = g.modalidad;
  if (Array.isArray(modalidad)) modalidad = modalidad[0];
  if (!modalidad || modalidad.codigo !== codigo) return null;
  var asistentes = Array.isArray(g.attendees) ? g.attendees : [];
  if (asistentes.length !== Number(g.cantidad_adultos) + Number(g.cantidad_menores)) return null;
  var titulares = asistentes.filter(function (a) { return a.es_titular === true; });
  if (titulares.length !== 1) return null;
  var esperado;
  if (codigo === 'familia_amigos') {
    if (
      Number(modalidad.precio_tarjeta) !== 70000 ||
      Number(modalidad.edad_minima_paga) !== 10 ||
      modalidad.permite_acompanantes !== true ||
      asistentes.some(function (a) {
        return typeof a.edad_al_evento !== 'number' ||
          !Number.isInteger(a.edad_al_evento) ||
          a.edad_al_evento < 0 || a.edad_al_evento > 120;
      })
    ) return null;
    esperado = asistentes.filter(function (a) { return Number(a.edad_al_evento) >= 10; }).length * 70000;
  } else if (codigo === 'companeros') {
    if (
      Number(modalidad.precio_tarjeta) !== 40000 ||
      modalidad.edad_minima_paga !== null ||
      modalidad.permite_acompanantes !== false ||
      asistentes.length !== 1
    ) return null;
    esperado = 40000;
  } else {
    return null;
  }
  return Number(g.importe_estimado) === esperado ? esperado : null;
}

/** Enlace de tarjeta por modalidad (puro; convención de enlacePara()). */
function enlaceModalidad(base, codigo) {
  return String(base).replace(/\/$/, '') + (codigo === 'companeros' ? '/#companeros' : '/#invitacion');
}

function puedeEnviar(c) {
  try {
    return MailApp.getRemainingDailyQuota() >= 5;
  } catch (e) {
    Logger.log('Cuota no consultable: ' + e);
    return false;
  }
}

/** Envío real o simulado. Devuelve 'enviado' | 'simulado' | 'omitido-test'. */
function enviarSeguro(c, para, asunto, cuerpo) {
  if (c.DRY || !c.ENVIAR) {
    Logger.log('[BLOQUEADO] DRY_RUN/ENVIAR_A_INVITADOS: ' + para);
    return 'simulado';
  }
  if (!listaPruebaValida(c)) {
    throw new Error('Envío bloqueado: TEST_ONLY_EMAILS debe contener exactamente un email autorizado válido.');
  }
  if (c.TEST.indexOf(String(para).toLowerCase()) < 0) {
    Logger.log('[TEST] Omitido (fuera de lista): ' + para);
    return 'omitido-test';
  }
  GmailApp.sendEmail(para, asunto, cuerpo, { name: c.NOMBRE });
  return 'enviado';
}

/**
 * Sonda de esquema: exige guests.modalidad_id + tabla modalidades.
 * Sin 0003 -> {ok:false} y NO se envía nada.
 */
function esquemaCorreo() {
  try {
    sb('guests?select=modalidad_id&limit=1', 'GET');
  } catch (e) {
    return { ok: false, motivo: 'sin-esquema (aplicar migración 0003)' };
  }
  var mods;
  try {
    mods = sb('modalidades?select=id,codigo,activa', 'GET');
  } catch (e) {
    return { ok: false, motivo: 'sin-tabla-modalidades (aplicar migración 0003)' };
  }
  var mapa = {};
  for (var i = 0; i < mods.length; i++) {
    if (mods[i].activa !== false) mapa[mods[i].codigo] = mods[i].id;
  }
  return { ok: true, mapa: mapa };
}

function revisionDiaria() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Otra ejecución en curso; salgo sin duplicar.');
    return { ok: false, motivo: 'lock' };
  }
  try {
    var c = CFG();
    var esq = esquemaCorreo();
    if (!esq.ok) {
      Logger.log('Esquema sin modalidades: ' + esq.motivo + '. Nada enviado.');
      return { ok: false, motivo: 'sin-esquema' };
    }
    if (c.ENVIAR && !c.DRY && !listaPruebaValida(c)) {
      Logger.log('Envío real ABORTADO: TEST_ONLY_EMAILS debe contener exactamente un email de prueba válido. Nada enviado, nada escrito.');
      return { ok: false, motivo: 'sin-lista-prueba' };
    }
    var resumen = { bienvenidas: {}, recordatorios: {}, bloqueados: {} };
    if (c.DRY || !c.ENVIAR) {
      Logger.log('Modo seguro: DRY_RUN=true o ENVIAR_A_INVITADOS=false. No se enviará ni escribirá.');
    }
    var orden = ['familia_amigos', 'companeros'];
    for (var k = 0; k < orden.length; k++) {
      var cod = orden[k];
      var modId = esq.mapa[cod];
      if (!modId) {
        resumen.bloqueados[cod] = 'modalidad-ausente';
        Logger.log('[' + cod + '] Modalidad ausente/inactiva: envíos de esta tarjeta bloqueados.');
        continue;
      }
      var tpls = sb('email_templates?select=clave,asunto,cuerpo,modalidad_id,modalidad:modalidades(codigo,nombre)', 'GET');
      var tb = plantillaPara(tpls, 'agradecimiento', modId);
      var tr = plantillaPara(tpls, 'recordatorio_pago', modId);
      if (!tb || !tr) {
        resumen.bloqueados[cod] = 'plantilla-ausente';
        Logger.log('[' + cod + '] Plantilla ausente o vacía: envíos de esta tarjeta bloqueados.');
        continue;
      }
      var enlace = enlaceModalidad(c.BASE, cod);
      Logger.log('[' + cod + '] Plantillas: bienvenida=' + tb.clave + ' recordatorio=' + tr.clave + ' enlace=' + enlace);
      resumen.bienvenidas[cod] = procesarBienvenidasMod(c, modId, cod, tb, enlace);
      resumen.recordatorios[cod] = procesarRecordatoriosMod(c, modId, cod, tr, enlace);
    }
    var sinMod = sb('guests?select=id&modalidad_id=is.null&limit=1', 'GET');
    resumen.bloqueados.sin_modalidad = Array.isArray(sinMod) && sinMod.length > 0;
    if (resumen.bloqueados.sin_modalidad) {
      Logger.log('Hay invitados sin modalidad: bloqueados (no se envían, no se modifican). Clasificar manualmente.');
    }
    Logger.log('Resumen: ' + JSON.stringify(resumen));
    return { ok: true, resumen: resumen };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Inserta el aviso en email_logs. Carrera/duplicado (UNIQUE en
 * idempotencia_clave) -> null sin romper la pasada (se reintenta mañana).
 */
function registrarAviso(payload) {
  try {
    var ins = sb('email_logs', 'POST', payload);
    var logId = (ins[0] && ins[0].id) || null;
    if (!logId) throw new Error('Supabase no confirmó el id del nuevo email_log.');
    return logId;
  } catch (e) {
    var texto = String(e);
    if (/Supabase 409:/.test(texto) && /idempotencia_clave|duplicate key|unique constraint/i.test(texto)) {
      Logger.log('Aviso duplicado por clave única; no se envía: ' + payload.idempotencia_clave);
      return null;
    }
    Logger.log('Error registrando aviso; envío abortado para evitar pérdida de trazabilidad: ' + texto);
    throw e;
  }
}

/**
 * En modo de prueba real (no DRY + TEST no vacía), recorta candidatos a la
 * lista ANTES de contar presupuesto y de cualquier escritura: cero POST para
 * los fuera de lista (sin huérfanos 'pendiente' ante un corte).
 */
function filtrarDestinatariosDePrueba(c, lista) {
  if (c.DRY || !c.ENVIAR || !listaPruebaValida(c)) return { lista: [], omitidos: lista.length };
  var dentro = [];
  var fuera = 0;
  for (var i = 0; i < lista.length; i++) {
    if (c.TEST.indexOf(String(lista[i].email).toLowerCase()) >= 0) dentro.push(lista[i]);
    else fuera++;
  }
  if (fuera > 0) Logger.log('[TEST] ' + fuera + ' fuera de lista: omitidos sin escribir.');
  return { lista: dentro, omitidos: fuera };
}

function listaPruebaValida(c) {
  return c.TEST.length === 1 &&
    /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(c.TEST[0]);
}

function procesarBienvenidasMod(c, modId, codigo, tpl, enlace) {
  var enviados = 0;
  var omitidos = 0;
  var procesados = 0;
  var inciertos = 0;
  var conf = sb(
    'guests?select=id,nombre_apellido,email,importe_estimado,modalidad_id,cantidad_adultos,cantidad_menores,modalidad:modalidades(codigo,precio_tarjeta,edad_minima_paga,permite_acompanantes),attendees(nombre,edad_al_evento,es_titular)&asistencia=eq.confirmado&modalidad_id=eq.' + modId + '&limit=500',
    'GET',
  );
  var recorte = filtrarDestinatariosDePrueba(c, conf);
  conf = recorte.lista;
  omitidos = recorte.omitidos;
  var enviadosPrev = {};
  if (conf.length > 0) {
    var ids = conf.map(function (g) { return g.id; });
    var filtroIds = encodeURIComponent('(' + ids.join(',') + ')');
    var logs = sb(
      'email_logs?select=guest_id,estado&tipo=eq.agradecimiento&guest_id=in.' + filtroIds + '&limit=1000',
      'GET',
    );
    for (var i = 0; i < logs.length; i++) {
      if (!enviadosPrev[logs[i].guest_id]) enviadosPrev[logs[i].guest_id] = [];
      enviadosPrev[logs[i].guest_id].push(logs[i].estado);
    }
  }

  for (var j = 0; j < conf.length; j++) {
    var g = conf[j];
    var importe = calcularImporteValidado(g, codigo);
    if (importe === null) {
      Logger.log('Bienvenida bloqueada por modalidad, composición o importe inconsistente: ' + g.id);
      continue;
    }
    if (enviadosPrev[g.id]) {
      if (enviadosPrev[g.id].some(function (estado) { return estado !== 'enviado'; })) {
        Logger.log('Bienvenida bloqueada: ya existe un resultado pendiente/fallido que requiere revisión manual: ' + g.id);
      }
      continue;
    }
    if (procesados >= c.MAX || !puedeEnviar(c)) break;
    procesados++;
    var cuerpo = String(tpl.cuerpo)
      .split('[Nombre]').join(primerNombre(g.nombre_apellido))
      .split('[Importe]').join(formatearARS(importe))
      .split('[Modalidad]').join(codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
      .split('[Enlace]').join(enlace);
    var asunto = String(tpl.asunto)
      .split('[Nombre]').join(primerNombre(g.nombre_apellido))
      .split('[Importe]').join(formatearARS(importe))
      .split('[Modalidad]').join(codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
      .split('[Enlace]').join(enlace);
    var clave = 'agradecimiento:' + g.id;
    if (c.DRY || !c.ENVIAR) {
      enviarSeguro(c, g.email, tpl.asunto, cuerpo);
      continue;
    }
    var logId = registrarAviso({
      guest_id: g.id,
      modalidad_id: modId,
      tipo: 'agradecimiento',
      destinatario: g.email,
      asunto: asunto,
      estado: 'pendiente',
      idempotencia_clave: clave,
    });
    if (!logId) continue;
    try {
      var estado = enviarSeguro(c, g.email, asunto, cuerpo);
      if (estado === 'enviado') {
        if (marcarAviso(logId, { estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() }, 'bienvenida de ' + g.email)) {
          enviados++;
        } else {
          inciertos++;
          Logger.log('Gmail aceptó la bienvenida, pero no se confirmó el registro. Queda incierta y no se reenviará automáticamente: ' + logId);
        }
      } else {
        sb('email_logs?id=eq.' + logId, 'DELETE', null);
        omitidos++;
      }
    } catch (e) {
      marcarAviso(
        logId,
        { estado: 'pendiente', intentos: 1, error: 'Resultado de Gmail incierto; no reenviar automáticamente. ' + String(e).slice(0, 350) },
        'bienvenida de ' + g.email,
      );
      inciertos++;
      Logger.log('Bienvenida con resultado de Gmail incierto; queda pendiente y bloqueada: ' + g.email + ': ' + e);
    }
  }
  return { enviados: enviados, omitidosTest: omitidos, inciertos: inciertos, revisados: procesados };
}

function procesarRecordatoriosMod(c, modId, codigo, tpl, enlace) {
  var enviados = 0;
  var errores = 0;
  var inciertos = 0;
  var ev = sb('event_settings?select=fecha_limite_pago,recordatorio_cada_dias,recordatorios_activos&limit=1', 'GET')[0];
  if (!ev || ev.recordatorios_activos === false || Number(ev.recordatorio_cada_dias) !== 10) {
    Logger.log('Recordatorios pausados o intervalo de configuración distinto de 10 días.');
    return { enviados: 0, motivo: 'pausado-o-intervalo-invalido' };
  }
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  if (hoy > ev.fecha_limite_pago) {
    Logger.log('Vencido: no se envía después del ' + ev.fecha_limite_pago + '.');
    return { enviados: 0, motivo: 'vencido' };
  }
  var cada = 10;
  var cand = sb(
    'guests?select=id,nombre_apellido,email,importe_estimado,modalidad_id,cantidad_adultos,cantidad_menores,modalidad:modalidades(codigo,precio_tarjeta,edad_minima_paga,permite_acompanantes),attendees(nombre,edad_al_evento,es_titular)&asistencia=eq.confirmado&estado_pago=eq.pendiente_pago&importe_estimado=gt.0&modalidad_id=eq.' + modId + '&limit=500',
    'GET',
  );
  var recorte = filtrarDestinatariosDePrueba(c, cand);
  cand = recorte.lista;
  var fueraDeLista = recorte.omitidos;
  var n = 0;
  for (var i = 0; i < cand.length; i++) {
    var g = cand[i];
    var importeValido = calcularImporteValidado(g, codigo);
    if (importeValido === null || g.estado_pago === 'pago_verificado') {
      Logger.log('Recordatorio bloqueado por modalidad, composición, importe o pago inconsistente: ' + g.id);
      continue;
    }
    if (n >= c.MAX || !puedeEnviar(c)) break;
    var ult = sb(
      'email_logs?select=estado,enviado_at&guest_id=eq.' + g.id + '&tipo=eq.recordatorio_pago&order=created_at.desc&limit=1',
      'GET',
    )[0];
    if (ult && ult.estado !== 'enviado') {
      Logger.log('Recordatorio bloqueado: existe un envío pendiente/fallido sin resolución manual: ' + g.id);
      continue;
    }
    if (ult && ult.enviado_at) {
      var dias = (Date.now() - new Date(ult.enviado_at).getTime()) / 86400000;
      if (dias < cada) continue;
    }
    n++;
    var cuerpo = String(tpl.cuerpo)
      .split('[Nombre]').join(primerNombre(g.nombre_apellido))
      .split('[Importe]').join(formatearARS(importeValido))
      .split('[Modalidad]').join(codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
      .split('[Enlace]').join(enlace);
    var asunto = String(tpl.asunto)
      .split('[Nombre]').join(primerNombre(g.nombre_apellido))
      .split('[Importe]').join(formatearARS(importeValido))
      .split('[Modalidad]').join(codigo === 'companeros' ? 'Compañeros' : 'Familia y amigos')
      .split('[Enlace]').join(enlace);
    var clave = 'recordatorio:' + g.id + ':' + hoy;
    if (c.DRY || !c.ENVIAR) {
      enviarSeguro(c, g.email, tpl.asunto, cuerpo);
      continue;
    }
    var logId = registrarAviso({
      guest_id: g.id,
      modalidad_id: modId,
      tipo: 'recordatorio_pago',
      destinatario: g.email,
      asunto: asunto,
      estado: 'pendiente',
      idempotencia_clave: clave,
    });
    if (!logId) continue; // ya existe hoy (idempotente) u otro: no reintentar en cadena
    try {
      var estado = enviarSeguro(c, g.email, asunto, cuerpo);
      if (estado === 'enviado') {
        if (marcarAviso(logId, { estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() }, 'recordatorio de ' + g.email)) {
          enviados++;
        } else {
          inciertos++;
          Logger.log('Gmail aceptó el recordatorio, pero no se confirmó el registro. Queda incierto y no se reenviará automáticamente: ' + logId);
        }
      } else {
        sb('email_logs?id=eq.' + logId, 'DELETE', null);
        Logger.log('Omitido por TEST_ONLY (sin marcar): ' + g.email);
      }
    } catch (e) {
      marcarAviso(
        logId,
        { estado: 'pendiente', intentos: 1, error: 'Resultado de Gmail incierto; no reenviar automáticamente. ' + String(e).slice(0, 350) },
        'recordatorio de ' + g.email,
      );
      errores++;
      inciertos++;
      Logger.log('Recordatorio con resultado de Gmail incierto; queda pendiente y bloqueado: ' + g.email + ': ' + e);
    }
  }
  return { enviados: enviados, errores: errores, inciertos: inciertos, candidatos: cand.length, fueraDeLista: fueraDeLista };
}
