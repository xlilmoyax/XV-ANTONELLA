/**
 * XV-ANTONELLA · Motor conversacional del asistente (determinista, sin IA externa).
 *
 * Cómo funciona (sin magia): el texto se normaliza (minúsculas, sin tildes),
 * se clasifica en una intención por reglas explícitas y cada intención ejecuta
 * consultas/cálculos reales sobre Metricas. El contexto (último tema y última
 * respuesta) resuelve referencias ("esos pagos", "esas familias", "el informe
 * anterior"); si es ambiguo, pide aclaración en vez de inventar.
 *
 * La UI lo presenta honestamente como motor de consultas estructuradas.
 * Persistencia: por administrador en localStorage (ver abajo); el modelo
 * servidor está en supabase/propuestas/0005 (sin aplicar).
 */

import { formatoARS } from './pricing';
import type { AjustesEvento, Metricas } from './metricas';

export interface Destino {
  tab: string;
  preset?: { q?: string; fAsist?: string; fPago?: string };
  texto?: string;
}

export interface RespuestaEstructurada {
  titulo: string;
  lineas: string[];
  metodo: string;
  destino?: Destino;
  tema: string;
}

export interface Mensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  ts: string;
  lineas?: string[];
  metodo?: string;
  destino?: Destino;
  tema?: string;
  error?: boolean;
}

export interface Conversacion {
  id: string;
  titulo: string;
  mensajes: Mensaje[];
  actualizada: string;
}

export interface ContextoChat {
  ultimoTema?: string;
  ultimoTitulo?: string;
}

export interface DatosAsistente {
  m: Metricas;
  ajustes: AjustesEvento;
  stamp: string;
}

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñü ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nombreGuest(m: Metricas, id: string): string {
  const g =
    m.confirmadosRegistros.find((x) => x.id === id) ??
    m.pendientesRespuesta.find((x) => x.id === id) ??
    m.noAsisten.find((x) => x.id === id);
  return g?.nombre_apellido ?? id;
}

/* ---------- constructores de respuesta (consultas reales) ---------- */

function rConfirmaciones(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  return {
    tema: 'confirmaciones',
    titulo: `Confirmaciones (${m.confirmadosRegistros.length} registros, ${m.personasConfirmadas} personas)`,
    lineas: [
      `Registros totales: ${m.totalRegistros} (formularios, no personas).`,
      `Confirmados: ${m.confirmadosRegistros.length} registros → ${m.personasConfirmadas} personas (${m.adultos} ad. + ${m.menores} men.).`,
      `Pendientes de respuesta: ${m.pendientesRespuesta.length}. No asisten: ${m.noAsisten.length}.`,
    ],
    metodo: 'Conteo directo por estado; personas = Σ cantidades declaradas.',
    destino: { tab: 'invitados', preset: { fAsist: 'confirmado' }, texto: 'Abrir confirmados' },
  };
}

function rDeuda(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  return {
    tema: 'deuda',
    titulo: `Saldo pendiente: ${formatoARS(m.importePendiente)}`,
    lineas: [
      `Esperado (confirmados que abonan): ${formatoARS(m.importeEsperado)}.`,
      `Pendiente: ${formatoARS(m.importePendiente)} en ${m.sinPagoRegistros.length} registros (${m.sinPagoPersonas} personas).`,
      `Excluye exentos. Importes estimados declarados, no bancarios.`,
    ],
    metodo: 'Σ importe_estimado donde asistencia=confirmado y estado=pendiente_pago.',
    destino: { tab: 'pendientes', texto: 'Abrir pendientes' },
  };
}

function rCobrado(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  return {
    tema: 'cobrado',
    titulo: `Recaudación verificada: ${formatoARS(m.recaudadoVerificado)}`,
    lineas: [
      `Avisos verificados: ${m.verificadosRecords.length}. Declarado sin verificar: ${formatoARS(m.recaudadoDeclarado)}.`,
      `Verificado = declarado + atestado por admin. Sin integración bancaria.`,
    ],
    metodo: 'Σ monto de payment_records con estado pago_verificado.',
    destino: { tab: 'pagos', texto: 'Abrir pagos' },
  };
}

function rPorVerificar(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  const lista = m.informadosRecords.slice(0, 15).map(
    (p) => `· ${nombreGuest(m, p.guest_id)} — ${formatoARS(p.monto ?? 0)} (declarado, no verificado)`,
  );
  if (m.informadosRecords.length > 15) lista.push(`…y ${m.informadosRecords.length - 15} más.`);
  if (m.informadosRecords.length === 0) lista.push('Sin avisos pendientes de verificación.');
  lista.push(
    `A verificar en total: ${formatoARS(m.recaudadoDeclarado)} · Por cobrar en total: ${formatoARS(m.importePendiente)} (conceptos distintos).`,
  );
  const difPorPago = new Map(m.diferencias.map((x) => [x.pagoId, x]));
  const rev = m.revisionRecords.slice(0, 10).map((p) => {
    const dif = difPorPago.get(p.id);
    const motivo = dif
      ? `difiere: esperado ${formatoARS(dif.esperado)}, informado ${formatoARS(dif.informado)}`
      : 'en revisión administrativa';
    return `· ${nombreGuest(m, p.guest_id)} — ${formatoARS(p.monto ?? 0)} (${motivo})`;
  });
  const lineas =
    rev.length > 0
      ? lista.concat(['En revisión:', ...rev])
      : lista.concat(['En revisión: sin registros (el estado “rechazado” no existe en el esquema).']);
  return {
    tema: 'por_verificar',
    titulo: `Por verificar: ${m.informadosRecords.length} avisos · En revisión: ${m.revisionRecords.length}`,
    lineas,
    metodo: 'Avisos informados + registros en revisión; importes declarados, nunca confirmados como cobrados.',
    destino: { tab: 'pagos', texto: 'Abrir pagos' },
  };
}

function rDiferencias(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  const lineas = m.diferencias.slice(0, 15).map(
    (x) => `· ${x.nombre}: esperado ${formatoARS(x.esperado)}, informado ${formatoARS(x.informado)}. No distribuir: conciliar.`,
  );
  if (m.diferencias.length > 15) lineas.push(`…y ${m.diferencias.length - 15} más.`);
  if (lineas.length === 0) lineas.push('Sin diferencias entre esperado e informado.');
  return {
    tema: 'diferencias',
    titulo: `Diferencias: ${m.diferencias.length}`,
    lineas,
    metodo: 'Avisos informados/en revisión cuyo monto difiere del importe del invitado.',
    destino: { tab: 'pagos', texto: 'Abrir pagos' },
  };
}

function rFamilias(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  const conSaldo = m.gruposAgg.filter((g) => g.saldo > 0);
  const lineas = conSaldo.slice(0, 15).map(
    (g) => `· ${g.nombre}: saldo ${formatoARS(g.saldo)} (esperado ${formatoARS(g.esperado)}, verificado ${formatoARS(g.verificado)}).`,
  );
  if (conSaldo.length > 15) lineas.push(`…y ${conSaldo.length - 15} más.`);
  if (lineas.length === 0) lineas.push(`Sin saldos en ${m.gruposAgg.length} grupos.`);
  return {
    tema: 'familias',
    titulo: `Familias con saldo: ${conSaldo.length} de ${m.gruposAgg.length}`,
    lineas,
    metodo: 'Agregados por grupo (saldo = esperado − verificado).',
    destino: { tab: 'invitados', texto: 'Abrir familias' },
  };
}

function rExentos(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  return {
    tema: 'exentos',
    titulo: `Menores exentos: ${m.exentos.length} personas en ${m.exentosInvitados.length} registros`,
    lineas: [
      `Menores de ${d.ajustes.edad_minima_paga} años al día del evento. No generan deuda.`,
      `Su autorización sigue el circuito explícito pendiente de esquema.`,
    ],
    metodo: 'Attendees con edad < regla en invitados confirmados.',
    destino: { tab: 'verificados', texto: 'Abrir verificados' },
  };
}

export interface LogLite {
  destinatario: string;
  estado: string;
  error?: string | null;
  enviado_at?: string | null;
  creado?: string;
  created_at: string;
}

/** Oculta parcialmente el destinatario: g***@dominio (nunca el contenido). */
export function enmascararEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return `${email.slice(0, 1)}***`;
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

function rCorreos(d: DatosAsistente, logs: LogLite[] | null): RespuestaEstructurada {
  const { m } = d;
  if (logs === null) {
    return {
      tema: 'correos',
      titulo: 'Correos: consulta no disponible',
      lineas: [
        'No se pudo leer el registro de envíos (error de consulta).',
        'No se afirma que no haya fallidos: reintentá la pregunta.',
      ],
      metodo: 'Fallo de lectura distinguido de lista vacía.',
      destino: { tab: 'correos', texto: 'Abrir correos' },
    };
  }
  const fallidos = logs
    .filter((l) => l.estado === 'fallido')
    .sort((a, b) => (b.enviado_at ?? b.created_at).localeCompare(a.enviado_at ?? a.created_at))
    .slice(0, 10);
  const lineas =
    logs.length === 0
      ? ['Sin envíos registrados: la automatización no está activada.']
      : [
          `Enviados: ${m.emailsOk} · Con error: ${m.emailsError}.`,
          `Próxima fecha calculada: ${m.proximaFechaRecordatorio ?? 'sin datos suficientes'}.`,
          `Candidatos actuales: ${m.candidatosRecordatorio.length}. Envío no activado.`,
          ...(fallidos.length > 0
            ? [
                'Fallidos recientes (máx. 10):',
                ...fallidos.map(
                  (l) =>
                    `· ${enmascararEmail(l.destinatario)} — ${(l.enviado_at ?? l.created_at).slice(0, 10)} — ${(l.error ?? 'sin detalle').slice(0, 90)}`,
                ),
              ]
            : ['Sin fallidos registrados.']),
        ];
  return {
    tema: 'correos',
    titulo: `Correos: ${m.emailsOk} enviados, ${m.emailsError} con error`,
    lineas,
    metodo: 'email_logs por estado, recientes primero; destinatarios parcialmente ocultos.',
    destino: { tab: 'correos', texto: 'Abrir correos' },
  };
}

function rVencimientos(d: DatosAsistente): RespuestaEstructurada {
  const hoy = new Date().toISOString().slice(0, 10);
  const lim = d.ajustes.fecha_limite_pago;
  return {
    tema: 'vencimientos',
    titulo: 'Fechas límite',
    lineas: [
      `Hoy: ${hoy}. Límite de pago: ${lim || 'sin configurar'}${lim ? (hoy > lim ? ' (VENCIDO)' : ' (vigente)') : ''}.`,
      `Recordatorios cada ${d.ajustes.recordatorio_cada_dias} días (${d.ajustes.recordatorios_activos ? 'activos' : 'pausados'} en configuración; envío no activado).`,
    ],
    metodo: 'event_settings + fecha actual.',
  };
}

function rTareas(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  const items: string[] = [];
  if (m.revisionRecords.length > 0) items.push(`1. Revisar ${m.revisionRecords.length} aviso(s) en revisión.`);
  if (m.informadosRecords.length > 0) items.push(`2. Verificar ${m.informadosRecords.length} pago(s) informado(s).`);
  if (m.informadosSinAviso.length > 0) items.push(`3. Crear avisos para ${m.informadosSinAviso.length} informado(s) sin registro.`);
  if (m.conteoIncoherente.length > 0) items.push(`4. Conciliar ${m.conteoIncoherente.length} conteo(s) inconsistente(s).`);
  if (m.pendientesRespuesta.length > 0) items.push(`5. Seguimiento a ${m.pendientesRespuesta.length} pendiente(s) de respuesta.`);
  if (items.length === 0) items.push('Sin tareas pendientes detectadas en los datos actuales.');
  return {
    tema: 'tareas',
    titulo: 'Tareas priorizadas',
    lineas: items,
    metodo: 'Reglas fijas: revisión > verificación > avisos > conteos > seguimiento.',
    destino: { tab: 'pendientes', texto: 'Abrir pendientes' },
  };
}

function rCambios(audits: Array<{ accion: string; entidad: string; actor_email?: string | null; created_at: string }>): RespuestaEstructurada {
  const lineas =
    audits.length === 0
      ? ['Sin movimientos auditados.']
      : audits.slice(0, 10).map((a) => `· ${a.accion} en ${a.entidad} por ${a.actor_email ?? '—'} (${a.created_at.slice(0, 16).replace('T', ' ')}).`);
  return {
    tema: 'cambios',
    titulo: 'Actividad reciente',
    lineas: lineas.concat(['Sin línea de base persistida: se muestra actividad reciente, no “cambios desde tu última revisión”.']),
    metodo: 'Últimas filas de audit_logs.',
  };
}

function rAutorizados(d: DatosAsistente): RespuestaEstructurada {
  const { m } = d;
  const verif = m.verificadosGuests.slice(0, 15).map(
    (g) => `· ${g.nombre_apellido} (${g.cantidad_adultos + g.cantidad_menores} pers., ${formatoARS(g.importe_estimado)})`,
  );
  return {
    tema: 'autorizados',
    titulo: `Autorización formal: no disponible (${m.verificadosGuests.length} con pago verificado)`,
    lineas: [
      'Personas con pago verificado (no implica autorización):',
      ...(verif.length > 0 ? verif : ['(ninguna)']),
      `Menores exentos (no deudores): ${m.exentos.length} personas.`,
      'El esquema no tiene estado de autorización ni responsable: nadie figura como autorizado.',
      'Propuesta pendiente: columnas de autorización + responsable + observaciones.',
    ],
    metodo: 'Lista real de verificados + aviso de carencia del esquema.',
    destino: { tab: 'verificados', texto: 'Abrir verificados' },
  };
}

/* ---------- informes (contenido + consistencia) ---------- */

export interface TablaInforme {
  titulo: string;
  cols: string[];
  filas: string[][];
}

export type TipoInforme = 'general' | 'pagos' | 'familias' | 'verificados' | 'actividad';

export interface InformeArmado {
  tipo: TipoInforme;
  titulo: string;
  secciones: Array<{ titulo: string; lineas: string[]; tabla?: TablaInforme }>;
  limitaciones: string[];
  stamp: string;
}

export function verificarConsistencia(m: Metricas): string[] {
  const problemas: string[] = [];
  const sumaPersonasListas =
    m.confirmadosRegistros.reduce((a, g) => a + g.cantidad_adultos + g.cantidad_menores, 0);
  if (sumaPersonasListas !== m.personasConfirmadas) {
    problemas.push('Personas confirmadas no coincide con el detalle.');
  }
  if (m.recaudadoVerificado < 0 || m.importePendiente < 0 || m.importeEsperado < 0) {
    problemas.push('Importe negativo detectado.');
  }
  return problemas;
}

export function construirInforme(
  tipo: TipoInforme,
  d: DatosAsistente,
  audits: Array<{ accion: string; entidad: string; actor_email?: string | null; created_at: string }>,
  etiqueta?: string,
): InformeArmado {
  const { m } = d;
  const stamp = d.stamp;
  const base: InformeArmado = {
    tipo,
    titulo: `XV-ANTONELLA · Informe ${tipo}${etiqueta ? ` · ${etiqueta}` : ''}`,
    secciones: [],
    limitaciones: [
      'Importes estimados salvo verificación manual del admin.',
      'Recaudación verificada = declarada + atestada (sin integración bancaria).',
      'Sin estado de autorización en el esquema: nadie figura como autorizado.',
    ],
    stamp,
  };
  // Resumen ejecutivo siempre primero, derivado solo de los datos del informe.
  base.secciones.push({
    titulo: 'Resumen ejecutivo',
    lineas: [
      `Generado ${stamp}. Alcance: datos actuales sin filtros.`,
      `Registros: ${m.totalRegistros} · Confirmados: ${m.confirmadosRegistros.length} (${m.personasConfirmadas} personas) · Pendientes: ${m.pendientesRespuesta.length} · No asisten: ${m.noAsisten.length}.`,
      `Esperado: ${formatoARS(m.importeEsperado)} · Verificado: ${formatoARS(m.recaudadoVerificado)} · Pendiente: ${formatoARS(m.importePendiente)}.`,
      m.inconsistencias.length > 0
        ? `Alerta: ${m.inconsistencias.length} inconsistencia(s) (ver Pendientes de gestión).`
        : 'Sin inconsistencias detectadas.',
      'Autorización formal no disponible: nadie figura como autorizado.',
    ],
  });
  if (tipo === 'general' || tipo === 'pagos') {
    base.secciones.push({
      titulo: 'Pagos pendientes de verificación',
      lineas: [`Avisos: ${m.informadosRecords.length} por ${formatoARS(m.recaudadoDeclarado)}.`],
      tabla: {
        titulo: 'Avisos informados',
        cols: ['Invitado', 'Importe informado', 'Fecha aviso'],
        filas: m.informadosRecords.map((p) => [
          nombreGuest(m, p.guest_id),
          formatoARS(p.monto ?? 0),
          (p.informado_at ?? '').slice(0, 10) || '—',
        ]),
      },
    });
    base.secciones.push({
      titulo: 'Diferencias y conciliación',
      lineas: [
        `Diferencias: ${m.diferencias.length}. Multi-avisos: ${m.multiAviso.length}. Informados sin aviso: ${m.informadosSinAviso.length}.`,
      ],
      tabla:
        m.diferencias.length > 0
          ? {
              titulo: 'Diferencias',
              cols: ['Invitado', 'Esperado', 'Informado'],
              filas: m.diferencias.map((x) => [x.nombre, formatoARS(x.esperado), formatoARS(x.informado)]),
            }
          : undefined,
    });
  }
  if (tipo === 'general' || tipo === 'familias') {
    const conSaldo = m.gruposAgg.filter((g) => g.saldo > 0);
    base.secciones.push({
      titulo: 'Familias con saldo',
      lineas: [`${conSaldo.length} de ${m.gruposAgg.length} grupos con saldo.`],
      tabla: {
        titulo: 'Saldos por grupo',
        cols: ['Grupo', 'Personas', 'Esperado', 'Verificado', 'Saldo'],
        filas: conSaldo.map((g) => [
          g.nombre,
          String(g.personas),
          formatoARS(g.esperado),
          formatoARS(g.verificado),
          formatoARS(g.saldo),
        ]),
      },
    });
  }
  if (tipo === 'general' || tipo === 'verificados') {
    base.secciones.push({
      titulo: 'Pagos verificados',
      lineas: [`${m.verificadosRecords.length} avisos por ${formatoARS(m.recaudadoVerificado)}. Menores exentos: ${m.exentos.length} personas.`],
      tabla: {
        titulo: 'Verificados',
        cols: ['Invitado', 'Personas', 'Importe'],
        filas: m.verificadosGuests.map((g) => [
          g.nombre_apellido,
          String(g.cantidad_adultos + g.cantidad_menores),
          formatoARS(g.importe_estimado),
        ]),
      },
    });
  }
  if (tipo === 'general' || tipo === 'actividad') {
    base.secciones.push({
      titulo: 'Actividad administrativa reciente',
      lineas:
        audits.length === 0
          ? ['Sin movimientos auditados.']
          : audits.slice(0, 20).map(
              (a) => `· ${a.accion} en ${a.entidad} por ${a.actor_email ?? '—'} (${a.created_at.slice(0, 16).replace('T', ' ')}).`,
            ),
    });
  }
  return base;
}

export function detectarInforme(texto: string): TipoInforme | null {
  const t = normalizar(texto);
  if (!/(informe|reporte|\bpdf\b|documento)/.test(t)) return null;
  if (/pago|cobr|deuda/.test(t)) return 'pagos';
  if (/familia|grupo/.test(t)) return 'familias';
  if (/verific/.test(t)) return 'verificados';
  if (/activ|auditor|historial|cambio/.test(t)) return 'actividad';
  return 'general';
}

/* ---------- enrutador con contexto ---------- */

const SALUDOS =
  /^(hola|buenas|buenos dias|buenas tardes|buenas noches|chau|adios|gracias|quien eres|que puedes hacer|que sabes hacer|ayuda|opciones|como funcionas)/;

export function responderLibre(
  pregunta: string,
  d: DatosAsistente,
  audits: Array<{ accion: string; entidad: string; actor_email?: string | null; created_at: string }>,
  contexto: ContextoChat,
  extras?: { logs?: LogLite[] | null },
): { r: RespuestaEstructurada | { aclaracion: string; sugerencias: string[] }; contexto: ContextoChat } {
  const t = normalizar(pregunta);
  const proximo: ContextoChat = { ...contexto };

  if (SALUDOS.test(t)) {
    return {
      r: {
        tema: 'ayuda',
        titulo: 'Asistente de gestión (consultas estructuradas)',
        lineas: [
          'Respondo con consultas reales a Supabase: confirmaciones, pagos, familias, correos y vencimientos.',
          'Probá: “¿cuánto falta cobrar?”, “pagos por verificar”, “familias con saldo”, “generá un informe de pagos”.',
          'Soy de consulta: no verifico, autorizo, modifico ni envío nada.',
        ],
        metodo: 'Respuesta conversacional fija (no requiere datos).',
      },
      contexto: proximo,
    };
  }

  // Referencias al contexto ("esos pagos", "el informe anterior", ...).
  // OJO: `cuanto es` lleva ancla de fin para no capturar "cuánto está…".
  // Sin contexto previo NO se responde aquí: se sigue al ruteo normal para
  // no secuestrar preguntas autónomas ("¿cuánto es lo verificado?").
  if (
    /anterior|es[oa]s |esos |esas |los que faltan|lo que mencionaste|y ahora|cuanto queda|cuanto es($| )/.test(t) &&
    contexto.ultimoTema
  ) {
    if (/(informe|reporte|pdf|documento)/.test(t)) {
      return {
        r: {
          tema: contexto.ultimoTema,
          titulo: 'Sobre lo anterior',
          lineas: [`Retomando “${contexto.ultimoTitulo ?? contexto.ultimoTema}”: repetí la pregunta concreta (p. ej. “pagos por verificar”) y la recalculo con datos actuales.`],
          metodo: 'Resolución de referencia al último tema; cifras nunca reutilizadas como actuales.',
        },
        contexto: proximo,
      };
    }
    if (contexto.ultimoTema === 'por_verificar' && /esos|pago/.test(t)) {
      proximo.ultimoTema = 'por_verificar';
      return { r: rPorVerificar(d), contexto: proximo };
    }
    if (contexto.ultimoTema === 'familias' && /esas|familia/.test(t)) {
      proximo.ultimoTema = 'familias';
      return { r: rFamilias(d), contexto: proximo };
    }
    if (contexto.ultimoTema && /cuanto|queda|falta/.test(t)) {
      proximo.ultimoTema = 'deuda';
      return { r: rDeuda(d), contexto: proximo };
    }
    return {
      r: {
        aclaracion: '¿A qué te referís con eso: pagos por verificar, familias con saldo o el último informe? Elegí una opción o reformulá.',
        sugerencias: ['Pagos por verificar', 'Familias con saldo', 'Generar informe general'],
      },
      contexto: proximo,
    };
  }

  const informe = detectarInforme(t);
  if (informe) {
    proximo.ultimoTema = `informe-${informe}`;
    proximo.ultimoTitulo = `informe ${informe}`;
    return {
      r: {
        tema: proximo.ultimoTema,
        titulo: `Preparo el informe “${informe}” con datos actuales`,
        lineas: [
          'Lo armo abajo como documento (tablas + totales verificados).',
          'Podés pedir “PDF” para la versión imprimible/descargable.',
        ],
        metodo: 'Constructor de informes sobre Metricas + verificación de consistencia.',
        destino: { tab: 'asistente' },
      },
      contexto: proximo,
    };
  }

  const reglas: Array<{ tema: string; re: RegExp; fn: () => RespuestaEstructurada }> = [
    { tema: 'tareas', re: /tarea|priori|primero|resolver|que hago|pendiente.*(hacer|atender)/, fn: () => rTareas(d) },
    { tema: 'diferencias', re: /diferencia|discrep|concilia/, fn: () => rDiferencias(d) },
    { tema: 'autorizados', re: /autorizad/, fn: () => rAutorizados(d) },
    { tema: 'por_verificar', re: /pendiente.*verific|sin verific|por verificar|requiere revision|en revision|revision|esperan.*verific|pendientes de verificacion|tengo que revisar|que revisar|revisar.*pago|necesitan.*revis/, fn: () => rPorVerificar(d) },
    { tema: 'cobrado', re: /cobrado|recaud|dinero|cuanto.*verificado|verificado.*cuanto|que.*verificado|se verifico|total.*verificado|cuanto.*(tenemos|hay)/, fn: () => rCobrado(d) },
    { tema: 'familias', re: /familia|grupo/, fn: () => rFamilias(d) },
    { tema: 'deuda', re: /deud|falta cobrar|saldo|adeuda|cuanto falta|por cobrar/, fn: () => rDeuda(d) },
    { tema: 'exentos', re: /exento|menor/, fn: () => rExentos(d) },
    { tema: 'correos', re: /correo|email|mail|recordatorio|fallo|envio|enviaron/, fn: () => rCorreos(d, extras?.logs ?? null) },
    { tema: 'vencimientos', re: /venc|limite|plazo|deadline|fecha.*pago/, fn: () => rVencimientos(d) },
    { tema: 'cambios', re: /cambi|nuevo|ultima|actividad|historial|reciente/, fn: () => rCambios(audits) },
    { tema: 'confirmaciones', re: /confirma|cuantas personas|cuantos.*(van|vienen|asisten)|asisten|invitados.*(hay|son)/, fn: () => rConfirmaciones(d) },
    { tema: 'pendientes', re: /falta.*respon|no respon|sin respon|quienes faltan|pendiente.*respu|quedan/, fn: () => ({
      tema: 'pendientes',
      titulo: `Sin respuesta: ${d.m.pendientesRespuesta.length}`,
      lineas: d.m.pendientesRespuesta.slice(0, 15).map((g) => `· ${g.nombre_apellido} (${g.email})`).concat(
        d.m.pendientesRespuesta.length > 15 ? [`…y ${d.m.pendientesRespuesta.length - 15} más.`] : d.m.pendientesRespuesta.length === 0 ? ['Todos respondieron o no hay registros.'] : [],
      ),
      metodo: 'Registros con asistencia pendiente o modificada.',
      destino: { tab: 'pendientes', texto: 'Abrir pendientes' },
    }) },
  ];
  for (const regla of reglas) {
    if (regla.re.test(t)) {
      const r = regla.fn();
      proximo.ultimoTema = r.tema;
      proximo.ultimoTitulo = r.titulo;
      return { r, contexto: proximo };
    }
  }

  return {
    r: {
      aclaracion: 'No entendí la pregunta con certeza y prefiero no adivinar. Elegí un tema o reformulá con palabras como pagos, familias, correos o informe.',
      sugerencias: ['¿Cuánto falta cobrar?', 'Pagos por verificar', 'Familias con saldo', 'Generar informe general'],
    },
    contexto: proximo,
  };
}

/* ---------- persistencia local por administrador ---------- */

const CLAVE = (actor: string) => `xv-asistente:${actor}`;
const MAX_CHATS = 20;
const MAX_MENSAJES = 100;

export function cargarChats(actor: string): { chats: Conversacion[]; soloMemoria: boolean } {
  try {
    const raw = localStorage.getItem(CLAVE(actor));
    if (!raw) return { chats: [], soloMemoria: false };
    const lista = JSON.parse(raw) as Conversacion[];
    if (!Array.isArray(lista)) return { chats: [], soloMemoria: false };
    return { chats: lista.slice(0, MAX_CHATS), soloMemoria: false };
  } catch {
    return { chats: [], soloMemoria: true };
  }
}

export function guardarChats(actor: string, chats: Conversacion[]): boolean {
  try {
    localStorage.setItem(CLAVE(actor), JSON.stringify(chats.slice(0, MAX_CHATS).map((c) => ({
      ...c,
      mensajes: c.mensajes.slice(-MAX_MENSAJES),
    }))));
    return true;
  } catch {
    return false;
  }
}

export function nuevaConversacion(): Conversacion {
  const ahora = new Date().toISOString();
  return {
    // UUID v4: mismo formato en local y remoto (permite migrar/sincronizar).
    id: crypto.randomUUID(),
    titulo: 'Nueva conversación',
    mensajes: [],
    actualizada: ahora,
  };
}

export function titularDesde(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  return limpio.length <= 42 ? limpio : `${limpio.slice(0, 42)}…`;
}
