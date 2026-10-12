/* ============================================================
 * XV-ANTONELLA · Correos por Gmail + Apps Script (archivo local, sin desplegar)
 * Pegar este contenido en script.google.com > Proyecto > Editor.
 *
 * QUÉ HACE (2 pasadas, 1 trigger diario):
 *   revisionDiaria() → procesarBienvenidas() + procesarRecordatorios()
 * - Bienvenida: confirmados SIN log 'agradecimiento/enviado' (detecta huecos
 *   aunque el Edge Function nunca se haya desplegado; misma clave de
 *   idempotencia `agradecimiento:<guest_id>`, sin duplicados).
 * - Recordatorios: mismas reglas que la Edge Function (SOLO confirmado +
 *   pendiente_pago + importe>0; respeta fecha límite, frecuencia configurable
 *   y clave diaria `recordatorio:<id>:<fecha>`; informados/verificados/no-show
 *   quedan excluidos por estado, incluido un «Ya Aboné» posterior).
 * - «Ya Aboné» no necesita cambios: funciona por estado, no por canal.
 * - Modalidades (B): este script usa las reglas actuales sin columna de
 *   modalidad. Cuando exista guests.modalidad_id + plantillas por modalidad,
 *   extender el filtro de candidatos y la selección de plantilla aquí.
 *
 * SEGURIDAD:
 * - Sin endpoint público (sin doGet/doPost): cero superficie de entrada.
 * - La service_role vive en Propiedades del script (nunca en código, URLs o
 *   frontend). RLS intacto; el rol de servicio es el único privilegiado.
 * - DRY_RUN=true por defecto: solo registra, no envía ni escribe en DB.
 * - TEST_ONLY_EMAILS: con valor, SOLO esas direcciones reciben de verdad.
 *
 * INSTALACIÓN (usuario, ~20 min):
 *  1. script.google.com > Proyecto nuevo > pegar este archivo > Guardar.
 *  2. Engranaje > Configuración > Zona horaria: America/Argentina/Buenos_Aires.
 *  3. Engranaje > Propiedades del script > Añadir:
 *     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_NOMBRE ("Antonella · Mis XV"),
 *     DRY_RUN=true, TEST_ONLY_EMAILS=(vacío), MAX_POR_EJECUCION=60.
 *  4. Ejecutar revisionDiaria() una vez a mano > Autorizar (cuenta Gmail del evento).
 *  5. Revisar Registros: debe decir DRY-RUN sin envíos ni escrituras.
 *  6. Desactivadores > Añadir activador: revisionDiaria, por tiempo, diaria 10:00.
 *  7. Para operar: DRY_RUN=false (+ TEST_ONLY_EMAILS con tu correo para probar).
 *
 * CUOTAS (docs oficiales, sujetas a cambio por Google):
 *  Gmail consumidor ~100 destinatarios/día; Workspace ~1500/día (rolling 24h).
 *  Ejecución máx. 6 min: el tope MAX_POR_EJECUCION lo respeta. Consultar
 *  MailApp.getRemainingDailyQuota() antes de cada tanda (implementado).
 *  Volumen estimado del evento (~240-450 correos en semanas): viable con
 *  cuenta común si los envíos se reparten; holgado con Workspace.
 * ============================================================ */

function CFG() {
  var p = PropertiesService.getScriptProperties();
  return {
    SB_URL: p.getProperty('SUPABASE_URL') || '',
    SB_KEY: p.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '',
    NOMBRE: p.getProperty('GMAIL_NOMBRE') || 'Antonella · Mis XV',
    DRY: (p.getProperty('DRY_RUN') || 'true') !== 'false',
    TEST: (p.getProperty('TEST_ONLY_EMAILS') || '')
      .split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return s.length > 0; }),
    MAX: Math.max(1, parseInt(p.getProperty('MAX_POR_EJECUCION') || '60', 10) || 60),
  };
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
    return [];
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

function puedeEnviar(c) {
  try {
    return MailApp.getRemainingDailyQuota() >= 5;
  } catch (e) {
    Logger.log('Cuota no consultable: ' + e);
    return true;
  }
}

/** Envío real o simulado. Devuelve 'enviado' | 'simulado' | 'omitido-test'. */
function enviarSeguro(c, para, asunto, cuerpo) {
  if (c.DRY) {
    Logger.log('[DRY-RUN] Para: ' + para + ' | Asunto: ' + asunto);
    return 'simulado';
  }
  if (c.TEST.length > 0 && c.TEST.indexOf(String(para).toLowerCase()) < 0) {
    Logger.log('[TEST] Omitido (fuera de lista): ' + para);
    return 'omitido-test';
  }
  GmailApp.sendEmail(para, asunto, cuerpo, { name: c.NOMBRE });
  return 'enviado';
}

function plantillaPorClave(tpls, clave, defectoAsunto) {
  for (var i = 0; i < tpls.length; i++) {
    if (tpls[i].clave === clave) return tpls[i];
  }
  return { asunto: defectoAsunto, cuerpo: '' };
}

function revisionDiaria() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Otra ejecución en curso; salgo sin duplicar.');
    return;
  }
  try {
    var b = procesarBienvenidas();
    var r = procesarRecordatorios();
    Logger.log('Resumen: bienvenidas=' + JSON.stringify(b) + ' recordatorios=' + JSON.stringify(r));
  } finally {
    lock.releaseLock();
  }
}

function procesarBienvenidas() {
  var c = CFG();
  var enviados = 0;
  var omitidos = 0;
  var procesados = 0;
  var tpls = sb('email_templates?select=clave,asunto,cuerpo', 'GET');
  var tpl = plantillaPorClave(tpls, 'agradecimiento', '¡Gracias por confirmar tu asistencia a los XV de Antonella!');
  var conf = sb(
    'guests?select=id,nombre_apellido,email,importe_estimado&asistencia=eq.confirmado&limit=500',
    'GET',
  );
  var enviadosPrev = {};
  var logs = sb('email_logs?select=guest_id&tipo=eq.agradecimiento&estado=eq.enviado&limit=2000', 'GET');
  for (var i = 0; i < logs.length; i++) enviadosPrev[logs[i].guest_id] = true;

  for (var j = 0; j < conf.length; j++) {
    var g = conf[j];
    if (enviadosPrev[g.id]) continue; // idempotente: ya tiene su bienvenida
    if (procesados >= c.MAX || !puedeEnviar(c)) break;
    procesados++;
    var nombre = primerNombre(g.nombre_apellido);
    var asunto = tpl.asunto;
    var cuerpo = String(tpl.cuerpo || '¡Gracias por confirmar!').split('[Nombre]').join(nombre);
    var clave = 'agradecimiento:' + g.id;
    if (c.DRY) {
      enviarSeguro(c, g.email, asunto, cuerpo);
      continue;
    }
    var ins = sb('email_logs', 'POST', {
      guest_id: g.id,
      tipo: 'agradecimiento',
      destinatario: g.email,
      asunto: asunto,
      estado: 'pendiente',
      idempotencia_clave: clave,
    });
    var logId = (ins[0] && ins[0].id) || null;
    if (!logId) {
      // Carrera/duplicado: la UNIQUE protege; se reintentará mañana sin duplicar.
      Logger.log('Aviso no registrado (posible duplicado) para ' + g.id);
      continue;
    }
    try {
      var estado = enviarSeguro(c, g.email, asunto, cuerpo);
      if (estado === 'enviado') {
        sb('email_logs?id=eq.' + logId, 'PATCH', { estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() });
        enviados++;
      } else {
        sb('email_logs?id=eq.' + logId, 'DELETE', null);
        omitidos++;
      }
    } catch (e) {
      sb('email_logs?id=eq.' + logId, 'PATCH', { estado: 'fallido', intentos: 1, error: String(e).slice(0, 500) });
      Logger.log('Fallo envío a ' + g.email + ': ' + e);
    }
  }
  return { enviados: enviados, omitidosTest: omitidos, revisados: procesados };
}

function procesarRecordatorios() {
  var c = CFG();
  var enviados = 0;
  var errores = 0;
  var ev = sb('event_settings?select=fecha_limite_pago,recordatorio_cada_dias,recordatorios_activos&limit=1', 'GET')[0];
  if (!ev || ev.recordatorios_activos === false) {
    Logger.log('Recordatorios pausados en configuración.');
    return { enviados: 0, motivo: 'pausado' };
  }
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  if (hoy > ev.fecha_limite_pago) {
    Logger.log('Vencido: no se envía después del ' + ev.fecha_limite_pago + '.');
    return { enviados: 0, motivo: 'vencido' };
  }
  var cada = Math.max(1, ev.recordatorio_cada_dias || 10);
  var tpls = sb('email_templates?select=clave,asunto,cuerpo', 'GET');
  var tpl = plantillaPorClave(tpls, 'recordatorio_pago', 'Recordatorio · Tarjeta XV de Antonella');
  var cand = sb(
    'guests?select=id,nombre_apellido,email,importe_estimado&asistencia=eq.confirmado&estado_pago=eq.pendiente_pago&importe_estimado=gt.0&limit=500',
    'GET',
  );
  var n = 0;
  for (var i = 0; i < cand.length; i++) {
    var g = cand[i];
    if (n >= c.MAX || !puedeEnviar(c)) break;
    var ult = sb(
      'email_logs?select=enviado_at&guest_id=eq.' + g.id + '&tipo=eq.recordatorio_pago&estado=eq.enviado&order=enviado_at.desc&limit=1',
      'GET',
    )[0];
    if (ult && ult.enviado_at) {
      var dias = (Date.now() - new Date(ult.enviado_at).getTime()) / 86400000;
      if (dias < cada) continue;
    }
    n++;
    var nombre = primerNombre(g.nombre_apellido);
    var asunto = tpl.asunto;
    var cuerpo = String(tpl.cuerpo || 'Recordatorio de pago.')
      .split('[Nombre]').join(nombre)
      .split('[Importe]').join(formatearARS(g.importe_estimado));
    var clave = 'recordatorio:' + g.id + ':' + hoy;
    if (c.DRY) {
      enviarSeguro(c, g.email, asunto, cuerpo);
      continue;
    }
    var ins = sb('email_logs', 'POST', {
      guest_id: g.id,
      tipo: 'recordatorio_pago',
      destinatario: g.email,
      asunto: asunto,
      estado: 'pendiente',
      idempotencia_clave: clave,
    });
    var logId = (ins[0] && ins[0].id) || null;
    if (!logId) continue; // ya existe hoy (idempotente) u otro: no reintentar en cadena
    try {
      var estado = enviarSeguro(c, g.email, asunto, cuerpo);
      if (estado === 'enviado') {
        sb('email_logs?id=eq.' + logId, 'PATCH', { estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() });
        enviados++;
      } else {
        sb('email_logs?id=eq.' + logId, 'DELETE', null);
        Logger.log('Omitido por TEST_ONLY (sin marcar): ' + g.email);
      }
    } catch (e) {
      sb('email_logs?id=eq.' + logId, 'PATCH', { estado: 'fallido', intentos: 1, error: String(e).slice(0, 500) });
      errores++;
      Logger.log('Fallo envío a ' + g.email + ': ' + e);
    }
  }
  return { enviados: enviados, errores: errores, candidatos: cand.length };
}
