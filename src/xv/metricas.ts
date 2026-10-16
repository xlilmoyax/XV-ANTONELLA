/**
 * XV-ANTONELLA · Motor de métricas del panel (FUENTE ÚNICA).
 *
 * Todas las cifras del dashboard, los listados y el asistente se calculan
 * aquí, con las mismas fórmulas y sobre los mismos arreglos cargados desde
 * Supabase. Dashboard ≡ listados ≡ consultas que los respaldan.
 *
 * Reglas documentadas:
 * - Un "registro" es UN formulario (fila de guests); "personas" suma
 *   cantidad_adultos + cantidad_menores de cada registro confirmado.
 * - Los acompañantes nunca se cuentan dos veces: viven en attendees y cada
 *   fila pertenece a un solo guest_id. Los totales de personas usan las
 *   cantidades declaradas; la coherencia (cantidades vs filas) se audita
 *   como inconsistencia visible, no se "corrige" en silencio.
 * - "Recaudado verificado" = Σ monto de payment_records con estado
 *   pago_verificado. Son importes DECLARADOS atestados por el admin, no
 *   movimientos bancarios (no hay integración bancaria).
 * - "Pendiente de cobro" = Σ importe_estimado de confirmados con
 *   pendiente_pago. Los exentos (no_corresponde) nunca suman deuda.
 * - Un pago compartido o con imputación incierta NO se distribuye: se
 *   lista como pendiente de conciliación.
 * - Sin autorización formal en el esquema: nada se muestra como autorizado.
 */

import type { Attendee, Guest } from './types';
import { calcularImporteModalidad, formatoARS } from './pricing';

export interface PagoRow {
  id: string;
  guest_id: string;
  monto: number;
  estado: string;
  medio?: string | null;
  informado_at?: string | null;
  verificado_at?: string | null;
  token_accion?: string;
  created_at: string;
}

export interface GrupoRow {
  id: string;
  nombre: string;
  manual?: boolean;
}

export interface MiembroRow {
  id?: string;
  group_id: string;
  guest_id: string;
  rol?: string;
}

export interface EmailLogRow {
  id: string;
  guest_id?: string | null;
  tipo: string;
  destinatario: string;
  asunto: string;
  estado: string;
  intentos?: number;
  error?: string | null;
  enviado_at?: string | null;
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor_email?: string | null;
  entidad: string;
  registro_id?: string | null;
  accion: string;
  created_at: string;
}

export interface AjustesEvento {
  fecha_limite_pago: string;
  recordatorio_cada_dias: number;
  recordatorios_activos: boolean;
}

export interface DiferenciaPago {
  pagoId: string;
  guestId: string;
  nombre: string;
  email: string;
  esperado: number;
  informado: number;
}

export interface Inconsistencia {
  tipo: string;
  detalle: string;
  guestId?: string;
}

export interface CandidatoRecordatorio {
  guestId: string;
  nombre: string;
  email: string;
  importe: number;
  ultimoEnvio: string | null;
  proximaFecha: string | null; // ISO yyyy-mm-dd o null si no calculable
}

export interface GrupoAgregado {
  grupoId: string;
  nombre: string;
  manual: boolean;
  registros: number;
  confirmados: number;
  personas: number;
  pagan: number;
  esperado: number;
  verificado: number;
  saldo: number;
}

export interface Metricas {
  totalRegistros: number;
  confirmadosRegistros: Guest[];
  personasConfirmadas: number;
  adultos: number;
  menores: number;
  pendientesRespuesta: Guest[];
  noAsisten: Guest[];
  exentos: Attendee[];
  exentosInvitados: Guest[];
  paganPersonas: number;
  sinPagoRegistros: Guest[];
  sinPagoPersonas: number;
  informadosGuests: Guest[];
  informadosRecords: PagoRow[];
  verificadosGuests: Guest[];
  verificadosRecords: PagoRow[];
  revisionGuests: Guest[];
  revisionRecords: PagoRow[];
  recaudadoVerificado: number;
  recaudadoDeclarado: number;
  importeEsperado: number;
  importePendiente: number;
  alDiaRegistros: number;
  alDiaPersonas: number;
  diferencias: DiferenciaPago[];
  informadosSinAviso: Guest[];
  verificadosSinRegistro: Guest[];
  multiAviso: Guest[];
  conteoIncoherente: Inconsistencia[];
  inconsistencias: Inconsistencia[];
  gruposAgg: GrupoAgregado[];
  candidatosRecordatorio: CandidatoRecordatorio[];
  proximaFechaRecordatorio: string | null;
  emailsOk: number;
  emailsError: number;
  totalGrupos: number;
}

const PAGO = {
  noCorresponde: 'no_corresponde',
  pendiente: 'pendiente_pago',
  informado: 'pago_informado',
  verificado: 'pago_verificado',
  revision: 'requiere_revision',
} as const;

export function esConfirmado(g: Guest): boolean {
  return g.asistencia === 'confirmado';
}

export function personasDe(g: Guest): number {
  return (g.cantidad_adultos ?? 0) + (g.cantidad_menores ?? 0);
}

function porId<T extends { id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

export function calcularMetricas(
  guests: Guest[],
  attendees: Attendee[],
  payments: PagoRow[],
  grupos: GrupoRow[],
  miembros: MiembroRow[],
  logs: EmailLogRow[],
  aj: AjustesEvento,
  modalidades: Array<{
    id: string;
    codigo: string;
    precio_tarjeta: number;
    edad_minima_paga: number | null;
  }> = [],
): Metricas {
  const porGuest = porId(guests);
  const modalidadPorId = new Map(modalidades.map((m) => [m.id, m]));
  const codigoPorModalidad = new Map(modalidades.map((m) => [m.id, m.codigo]));
  const attendeesPorGuest = new Map<string, Attendee[]>();
  for (const attendee of attendees) {
    const existentes = attendeesPorGuest.get(attendee.guest_id) ?? [];
    existentes.push(attendee);
    attendeesPorGuest.set(attendee.guest_id, existentes);
  }
  const confirmados = guests.filter(esConfirmado);
  const confirmadosIds = new Set(confirmados.map((g) => g.id));
  const calculos = new Map<string, ReturnType<typeof calcularImporteModalidad>>();
  const pagantesPorGuest = new Map<string, number>();
  const modalidadValida = new Set<string>();
  const modalidadIncoherente: Inconsistencia[] = [];
  for (const g of confirmados) {
    const modalidad = g.modalidad_id ? modalidadPorId.get(g.modalidad_id) ?? null : null;
    if (!modalidad) {
      modalidadIncoherente.push({
        tipo: 'modalidad',
        detalle: `${g.nombre_apellido}: falta una modalidad validada; importe histórico conservado.`,
        guestId: g.id,
      });
      continue;
    }
    const filas = attendeesPorGuest.get(g.id) ?? [];
    const calculo = calcularImporteModalidad(
      modalidad.codigo,
      filas.map((a) => a.edad_al_evento),
      g.cantidad_adultos,
      g.cantidad_menores,
      modalidad.precio_tarjeta,
      modalidad.edad_minima_paga,
    );
    calculos.set(g.id, calculo);
    if (calculo.error || calculo.importe !== g.importe_estimado) {
      modalidadIncoherente.push({
        tipo: 'importe-modalidad',
        detalle: `${g.nombre_apellido}: importe guardado ${formatoARS(g.importe_estimado)}; ${calculo.error ?? `cálculo validado ${formatoARS(calculo.importe)}`}.`,
        guestId: g.id,
      });
      continue;
    }
    pagantesPorGuest.set(g.id, calculo.personasQueAbonan);
    modalidadValida.add(g.id);
  }

  const personasConfirmadas = confirmados.reduce((a, g) => a + personasDe(g), 0);
  const adultos = confirmados.reduce((a, g) => a + (g.cantidad_adultos ?? 0), 0);
  const menores = confirmados.reduce((a, g) => a + (g.cantidad_menores ?? 0), 0);

  const pendientesRespuesta = guests.filter(
    (g) => g.asistencia === 'pendiente' || g.asistencia === 'modificado',
  );
  const noAsisten = guests.filter((g) => g.asistencia === 'no_asistira');

  // La exención por edad solo aplica a Familia y amigos.
  const exentos = attendees.filter(
    (a) =>
      a.edad_al_evento !== null &&
      a.edad_al_evento !== undefined &&
      a.edad_al_evento < 10 &&
      codigoPorModalidad.get(porGuest.get(a.guest_id)?.modalidad_id ?? '') === 'familia_amigos' &&
      modalidadValida.has(a.guest_id) &&
      confirmadosIds.has(a.guest_id),
  );
  const exentosGuestIds = new Set(exentos.map((a) => a.guest_id));
  const exentosInvitados = guests.filter((g) => exentosGuestIds.has(g.id));

  const paganPersonas = [...pagantesPorGuest.values()].reduce((total, cantidad) => total + cantidad, 0);

  const sinPagoRegistros = confirmados.filter((g) => g.estado_pago === PAGO.pendiente);
  const sinPagoPersonas = sinPagoRegistros.reduce((a, g) => a + (pagantesPorGuest.get(g.id) ?? 0), 0);

  const informadosGuests = guests.filter((g) => g.estado_pago === PAGO.informado);
  const informadosRecords = payments.filter((p) => p.estado === PAGO.informado);
  const verificadosGuests = guests.filter((g) => g.estado_pago === PAGO.verificado);
  const verificadosRecords = payments.filter((p) => p.estado === PAGO.verificado);
  const revisionGuests = guests.filter((g) => g.estado_pago === PAGO.revision);
  const revisionRecords = payments.filter((p) => p.estado === PAGO.revision);

  const recaudadoVerificado = verificadosRecords.reduce((a, p) => a + (p.monto ?? 0), 0);
  const recaudadoDeclarado = informadosRecords.reduce((a, p) => a + (p.monto ?? 0), 0);
  const importeEsperado = confirmados
    .filter((g) => g.estado_pago !== PAGO.noCorresponde && modalidadValida.has(g.id))
    .reduce((a, g) => a + (g.importe_estimado ?? 0), 0);
  const importePendiente = confirmados
    .filter((g) => g.estado_pago === PAGO.pendiente && modalidadValida.has(g.id))
    .reduce((a, g) => a + (g.importe_estimado ?? 0), 0);

  const alDia = confirmados.filter(
    (g) => g.estado_pago === PAGO.noCorresponde || g.estado_pago === PAGO.verificado,
  );
  const alDiaRegistros = alDia.length;
  const alDiaPersonas = alDia.reduce((a, g) => a + personasDe(g), 0);

  // Diferencias: aviso informado/revisión cuyo monto difiere del esperado.
  const diferencias: DiferenciaPago[] = [];
  for (const p of payments) {
    if (p.estado !== PAGO.informado && p.estado !== PAGO.revision) continue;
    const g = porGuest.get(p.guest_id);
    if (!g) continue;
    if ((p.monto ?? 0) !== (g.importe_estimado ?? 0)) {
      diferencias.push({
        pagoId: p.id,
        guestId: g.id,
        nombre: g.nombre_apellido,
        email: g.email,
        esperado: g.importe_estimado ?? 0,
        informado: p.monto ?? 0,
      });
    }
  }

  // Avisos cruzados: informado sin registro / verificado sin registro / multi-aviso.
  const recordsPorGuest = new Map<string, PagoRow[]>();
  for (const p of payments) {
    if (!recordsPorGuest.has(p.guest_id)) recordsPorGuest.set(p.guest_id, []);
    recordsPorGuest.get(p.guest_id)!.push(p);
  }
  const informadosSinAviso = informadosGuests.filter(
    (g) => (recordsPorGuest.get(g.id) ?? []).length === 0,
  );
  const verificadosSinRegistro = verificadosGuests.filter(
    (g) => !(recordsPorGuest.get(g.id) ?? []).some((p) => p.estado === PAGO.verificado),
  );
  const multiAviso = guests.filter((g) => (recordsPorGuest.get(g.id) ?? []).length > 1);

  // Coherencia cantidades vs filas de acompañantes (no se corrige, se informa).
  const conteoPorGuest = new Map<string, number>();
  for (const a of attendees) {
    conteoPorGuest.set(a.guest_id, (conteoPorGuest.get(a.guest_id) ?? 0) + 1);
  }
  const conteoIncoherente: Inconsistencia[] = [];
  for (const g of confirmados) {
    const filas = conteoPorGuest.get(g.id) ?? 0;
    if (filas !== personasDe(g)) {
      conteoIncoherente.push({
        tipo: 'conteo',
        detalle: `${g.nombre_apellido}: declara ${personasDe(g)} persona(s) pero tiene ${filas} fila(s) de asistentes.`,
        guestId: g.id,
      });
    }
  }

  const inconsistencias: Inconsistencia[] = [
    ...modalidadIncoherente,
    ...conteoIncoherente,
    ...informadosSinAviso.map((g) => ({
      tipo: 'aviso',
      detalle: `${g.nombre_apellido}: pago informado sin aviso vinculado.`,
      guestId: g.id,
    })),
    ...verificadosSinRegistro.map((g) => ({
      tipo: 'verificacion',
      detalle: `${g.nombre_apellido}: verificado sin registro de pago verificado.`,
      guestId: g.id,
    })),
    ...multiAviso.map((g) => ({
      tipo: 'multi-aviso',
      detalle: `${g.nombre_apellido}: tiene ${(recordsPorGuest.get(g.id) ?? []).length} avisos de pago (conciliar, no sumar dos veces).`,
      guestId: g.id,
    })),
  ];

  // Agregados por grupo (por grupo; si un invitado está en 2 grupos figura en
  // ambos: se indica, no se mezclan con los totales generales).
  const miembrosPorGrupo = new Map<string, string[]>();
  for (const m of miembros) {
    if (!miembrosPorGrupo.has(m.group_id)) miembrosPorGrupo.set(m.group_id, []);
    miembrosPorGrupo.get(m.group_id)!.push(m.guest_id);
  }
  const gruposAgg: GrupoAgregado[] = grupos.map((gr) => {
    const ids = [...new Set(miembrosPorGrupo.get(gr.id) ?? [])];
    const gs = ids.map((id) => porGuest.get(id)).filter((x): x is Guest => Boolean(x));
    const conf = gs.filter(esConfirmado);
    const pagan = ids.reduce((total, id) => total + (pagantesPorGuest.get(id) ?? 0), 0);
    const esperado = conf
      .filter((g) => g.estado_pago !== PAGO.noCorresponde && modalidadValida.has(g.id))
      .reduce((a, g) => a + (g.importe_estimado ?? 0), 0);
    const verificado = conf
      .flatMap((g) => recordsPorGuest.get(g.id) ?? [])
      .filter((p) => p.estado === PAGO.verificado)
      .reduce((a, p) => a + (p.monto ?? 0), 0);
    return {
      grupoId: gr.id,
      nombre: gr.nombre,
      manual: gr.manual ?? true,
      registros: gs.length,
      confirmados: conf.length,
      personas: conf.reduce((a, g) => a + personasDe(g), 0),
      pagan,
      esperado,
      verificado,
      saldo: esperado - verificado,
    };
  });

  // Recordatorios: candidatos + última fecha + próxima (única fuente).
  const ultimoEnvio = new Map<string, string>();
  for (const l of logs) {
    if (l.tipo !== 'recordatorio_pago' || l.estado !== 'enviado' || !l.guest_id || !l.enviado_at) {
      continue;
    }
    const prev = ultimoEnvio.get(l.guest_id);
    if (!prev || l.enviado_at > prev) ultimoEnvio.set(l.guest_id, l.enviado_at);
  }
  const cadaMs = Math.max(1, aj.recordatorio_cada_dias || 10) * 86_400_000;
  const candidatosRecordatorio: CandidatoRecordatorio[] = confirmados
    .filter((g) =>
      g.estado_pago === PAGO.pendiente &&
      (g.importe_estimado ?? 0) > 0 &&
      calculos.get(g.id)?.error === null &&
      calculos.get(g.id)?.importe === g.importe_estimado,
    )
    .map((g) => {
      const ult = ultimoEnvio.get(g.id) ?? null;
      const proxima = ult
        ? new Date(new Date(ult).getTime() + cadaMs).toISOString().slice(0, 10)
        : null;
      return {
        guestId: g.id,
        nombre: g.nombre_apellido,
        email: g.email,
        importe: g.importe_estimado ?? 0,
        ultimoEnvio: ult ? ult.slice(0, 10) : null,
        proximaFecha: proxima,
      };
    })
    .sort((a, b) => (a.proximaFecha ?? '').localeCompare(b.proximaFecha ?? ''));
  const fechas = candidatosRecordatorio
    .map((c) => c.proximaFecha)
    .filter((f): f is string => Boolean(f));
  const proximaFechaRecordatorio = fechas.length > 0 ? fechas.sort()[0] : null;

  const emailsOk = logs.filter((l) => l.estado === 'enviado').length;
  const emailsError = logs.filter((l) => l.estado === 'fallido').length;

  return {
    totalRegistros: guests.length,
    confirmadosRegistros: confirmados,
    personasConfirmadas,
    adultos,
    menores,
    pendientesRespuesta,
    noAsisten,
    exentos,
    exentosInvitados,
    paganPersonas,
    sinPagoRegistros,
    sinPagoPersonas,
    informadosGuests,
    informadosRecords,
    verificadosGuests,
    verificadosRecords,
    revisionGuests,
    revisionRecords,
    recaudadoVerificado,
    recaudadoDeclarado,
    importeEsperado,
    importePendiente,
    alDiaRegistros,
    alDiaPersonas,
    diferencias,
    informadosSinAviso,
    verificadosSinRegistro,
    multiAviso,
    conteoIncoherente,
    inconsistencias,
    gruposAgg,
    candidatosRecordatorio,
    proximaFechaRecordatorio,
    emailsOk,
    emailsError,
    totalGrupos: grupos.length,
  };
}
