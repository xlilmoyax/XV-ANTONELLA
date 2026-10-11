import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatoARS } from '../../xv/pricing';
import {
  cargarChats,
  construirInforme,
  guardarChats,
  nuevaConversacion,
  responderLibre,
  titularDesde,
  verificarConsistencia,
  type ContextoChat,
  type Conversacion,
  type DatosAsistente,
  type InformeArmado,
  type Mensaje,
} from '../../xv/conversacion';
import {
  crearConversacionRemota,
  detectarModo,
  eliminarRemoto,
  listarRemoto,
  renombrarRemoto,
  subirMensajes,
} from '../../xv/chatStore';
import {
  cargarMapa,
  fusionarConversaciones,
  guardarMapa,
  mensajesFaltantes,
  type MapaSync,
} from '../../xv/sincronia';
import type { Attendee, Guest } from '../../xv/types';
import {
  ENCUADRES,
  FONDOS,
  MAX_BYTES_IMAGEN,
  mapaDiseno,
  nombreSeguro,
  pathDesdeUrl,
  resolverFondo,
  type FondoDef,
} from '../../xv/diseno';
import type {
  AjustesEvento,
  AuditRow,
  EmailLogRow,
  GrupoRow,
  Metricas,
  MiembroRow,
  PagoRow,
} from '../../xv/metricas';
import {
  TEXTO_ASISTENCIA,
  TEXTO_PAGO,
  TONO_ASISTENCIA,
  TONO_PAGO,
  auditar,
  descargarCsv,
  fechaCorta,
  fechaHora,
} from './util';
import { AvisoEsquema, Etiqueta, Tarjeta, Vacio, Volver } from './atomos';

export type SeccionId =
  | 'resumen'
  | 'invitados'
  | 'pagos'
  | 'verificados'
  | 'pendientes'
  | 'asistente'
  | 'historial'
  | 'contenidos'
  | 'galeria'
  | 'correos'
  | 'diseno';

type R = Record<string, unknown>;

export interface Ctx {
  m: Metricas;
  guests: Guest[];
  attendees: Attendee[];
  payments: PagoRow[];
  groups: GrupoRow[];
  members: MiembroRow[];
  logs: EmailLogRow[];
  audits: AuditRow[];
  templates: R[];
  sections: R[];
  images: R[];
  versions: R[];
  settings: R | null;
  ajustes: AjustesEvento;
  actor: string | null;
  recargar: () => Promise<void>;
  ir: (tab: SeccionId, preset?: { q?: string; fAsist?: string; fPago?: string }) => void;
  actualizacion: string;
  erroresCarga: Record<string, string>;
  modalidades: Array<{ id: string; codigo: string; nombre: string }>;
  vistaModalidad: string;
}

function nombreGuest(ctx: Ctx, id: string): string {
  return ctx.guests.find((g) => g.id === id)?.nombre_apellido ?? id;
}

/** Etiqueta de modalidad por fila (— si no hay clasificación disponible). */
function etiquetaModalidad(ctx: Ctx, modalidadId?: string | null): string {
  if (!modalidadId) return '—';
  return ctx.modalidades.find((x) => x.id === modalidadId)?.nombre ?? '—';
}

function modalidadDe(g: Guest): string | null {
  return (g as unknown as { modalidad_id?: string | null }).modalidad_id ?? null;
}

/* ==================== RESUMEN ==================== */

export function Resumen({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const act = ctx.actualizacion;
  const card = (
    titulo: string,
    valor: string,
    explicacion: string,
    tab: SeccionId,
    preset?: { q?: string; fAsist?: string; fPago?: string },
  ) => (
    <Tarjeta
      key={titulo}
      titulo={titulo}
      valor={valor}
      explicacion={explicacion}
      actualizacion={act}
      onVer={() => ctx.ir(tab, preset)}
    />
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {card('Invitados registrados', String(m.totalRegistros), 'Formularios de confirmación guardados (no son personas).', 'invitados')}
      {card('Personas confirmadas', String(m.personasConfirmadas), `Adultos ${m.adultos} + menores ${m.menores} en registros confirmados. Acompañantes contados una sola vez.`, 'invitados', { fAsist: 'confirmado' })}
      {card('Pendientes de respuesta', String(m.pendientesRespuesta.length), 'Registros en estado pendiente o modificado.', 'pendientes')}
      {card('Confirmados sin pago', `${m.sinPagoRegistros.length} reg. · ${m.sinPagoPersonas} pers.`, 'Confirmados con pago pendiente. Excluye exentos.', 'pendientes')}
      {card('Pagos informados', String(m.informadosRecords.length), 'Avisos declarados aún no verificados. No es dinero cobrado.', 'pagos')}
      {card('Pagos verificados', String(m.verificadosRecords.length), 'Avisos confirmados por el admin. Ver “recaudación verificada”.', 'pagos')}
      {card('Personas autorizadas', 'No disponible', 'El esquema no tiene estado de autorización. Requiere ampliación (ver Verificados).', 'verificados')}
      {card('Verificado sin autorizar', 'No disponible', 'Sin estado de autorización no se puede calcular. Ver propuesta en Verificados.', 'verificados')}
      {card('Menores exentos', `${m.exentos.length} pers. · ${m.exentosInvitados.length} reg.`, `Menores de ${ctx.ajustes.edad_minima_paga} al día del evento. No generan deuda.`, 'verificados')}
      {card('Recaudación verificada', formatoARS(m.recaudadoVerificado), 'Suma de avisos verificados (montos declarados atestados, no bancarios).', 'pagos')}
      {card('Importe pendiente', formatoARS(m.importePendiente), 'Suma estimada de confirmados con pago pendiente.', 'pendientes')}
      {card('En revisión', String(m.revisionGuests.length + m.revisionRecords.length), 'Registros y avisos que requieren revisión administrativa.', 'pendientes')}
      {card('Familias / grupos', String(m.totalGrupos), 'Grupos manuales o sugeridos aceptados.', 'invitados')}
      {card('Correos ok / errores', `${m.emailsOk} / ${m.emailsError}`, m.emailsOk + m.emailsError === 0 ? 'Sin envíos: automatización no activada.' : 'Enviados y fallidos registrados.', 'correos')}
      {card('Próximo recordatorio', m.proximaFechaRecordatorio ?? 'Sin datos', m.proximaFechaRecordatorio ? 'Fecha mínima calculada (último envío + periodicidad). Automatización no activada.' : 'Sin envíos previos para calcular. Automatización no activada.', 'correos')}
      {card('Inconsistencias', String(m.inconsistencias.length), 'Conteos, avisos y verificaciones que requieren conciliación.', 'pendientes')}
    </div>
  );
}

/* ==================== INVITADOS Y FAMILIAS ==================== */

type Orden = 'recientes' | 'antiguos' | 'apellido' | 'estado';

export function Invitados({
  ctx,
  presetQ = '',
  presetAsist = '',
  presetPago = '',
}: {
  ctx: Ctx;
  presetQ?: string;
  presetAsist?: string;
  presetPago?: string;
}) {
  const [q, setQ] = useState(presetQ);
  const [fAsist, setFAsist] = useState(presetAsist);
  const [fPago, setFPago] = useState(presetPago);
  const [orden, setOrden] = useState<Orden>('recientes');
  const [pagina, setPagina] = useState(0);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const POR_PAGINA = 20;

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = ctx.guests.filter(
      (g) =>
        (!t ||
          g.nombre_apellido.toLowerCase().includes(t) ||
          g.email.toLowerCase().includes(t) ||
          (g.apellido_familiar ?? '').toLowerCase().includes(t)) &&
        (!fAsist || g.asistencia === fAsist) &&
        (!fPago || g.estado_pago === fPago),
    );
    const porEstado = (a: Guest, b: Guest) => a.asistencia.localeCompare(b.asistencia);
    switch (orden) {
      case 'antiguos':
        return [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'apellido':
        return [...lista].sort((a, b) => a.nombre_apellido.localeCompare(b.nombre_apellido, 'es'));
      case 'estado':
        return [...lista].sort(porEstado);
      default:
        return [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [ctx.guests, q, fAsist, fPago, orden]);

  const paginados = filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);
  const acompCount = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of ctx.attendees) mapa.set(a.guest_id, (mapa.get(a.guest_id) ?? 0) + 1);
    return mapa;
  }, [ctx.attendees]);

  const cambiar = async (g: Guest, campo: 'asistencia' | 'estado_pago', valor: string) => {
    const antes = { ...g };
    const { error } = await supabase.from('guests').update({ [campo]: valor }).eq('id', g.id);
    if (error) {
      setNota(`No se pudo guardar: ${error.message}`);
      return;
    }
    const aviso = await auditar(ctx.actor, 'guests', g.id, `cambio-${campo}`, antes, { [campo]: valor });
    if (aviso) setNota(aviso);
    await ctx.recargar();
  };

  const detalle = detalleId ? ctx.guests.find((g) => g.id === detalleId) ?? null : null;

  return (
    <div>
      {nota && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {nota} <button className="underline" onClick={() => setNota(null)}>Ocultar</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPagina(0); }}
          placeholder="Buscar nombre, email o familia…"
          aria-label="Buscar invitados"
          className="min-w-52 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
        />
        <select value={fAsist} onChange={(e) => { setFAsist(e.target.value); setPagina(0); }} aria-label="Filtro de confirmación" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">Confirmación: todas</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmado">Confirmado</option>
          <option value="no_asistira">No asistirá</option>
          <option value="modificado">Modificado</option>
        </select>
        <select value={fPago} onChange={(e) => { setFPago(e.target.value); setPagina(0); }} aria-label="Filtro de pago" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">Pago: todos</option>
          <option value="no_corresponde">No corresponde</option>
          <option value="pendiente_pago">Pendiente</option>
          <option value="pago_informado">Informado</option>
          <option value="pago_verificado">Verificado</option>
          <option value="requiere_revision">Revisión</option>
        </select>
        <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Orden" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="recientes">Más recientes</option>
          <option value="antiguos">Más antiguos</option>
          <option value="apellido">Apellido A–Z</option>
          <option value="estado">Por estado</option>
        </select>
        <button
          onClick={() => descargarCsv(filtrados as unknown as Array<Record<string, unknown>>, 'invitados.csv')}
          className="inline-flex items-center gap-2 rounded-full border border-[#68785b] px-4 py-2 text-xs font-medium text-[#183b2d]"
        >
          <Download size={14} /> CSV ({filtrados.length})
        </button>
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-4"><Vacio texto="Ningún registro coincide con los filtros aplicados." /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-[#183b2d] text-left text-xs uppercase tracking-wider text-[#f8f4e9]">
                <th className="p-3">Nombre</th><th className="p-3">Familia</th><th className="p-3">Modalidad</th><th className="p-3">Registro</th>
                <th className="p-3">Confirmación</th><th className="p-3">Pers.</th><th className="p-3">Acomp.</th>
                <th className="p-3">Importe</th><th className="p-3">Pago</th><th className="p-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {paginados.map((g) => (
                <tr key={g.id} className="border-t border-stone-200 text-stone-900">
                  <td className="p-3"><p className="font-medium">{g.nombre_apellido}</p><p className="text-xs text-stone-500">{g.email}</p></td>
                  <td className="p-3">{g.apellido_familiar ?? '—'}</td>
                  <td className="p-3 text-xs">{etiquetaModalidad(ctx, modalidadDe(g))}</td>
                  <td className="p-3 text-xs tabular-nums">{fechaCorta(g.created_at)}</td>
                  <td className="p-3">
                    <Etiqueta tono={TONO_ASISTENCIA[g.asistencia] ?? 'neutro'}>{TEXTO_ASISTENCIA[g.asistencia] ?? g.asistencia}</Etiqueta>
                    <div className="mt-1">
                      <select value={g.asistencia} onChange={(e) => cambiar(g, 'asistencia', e.target.value)} aria-label={`Cambiar confirmación de ${g.nombre_apellido}`} className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs">
                        <option value="pendiente">Pendiente</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="no_asistira">No asistirá</option>
                        <option value="modificado">Modificado</option>
                      </select>
                    </div>
                  </td>
                  <td className="p-3 tabular-nums">{g.cantidad_adultos + g.cantidad_menores}</td>
                  <td className="p-3 tabular-nums">{acompCount.get(g.id) ?? 0}</td>
                  <td className="p-3 tabular-nums">{formatoARS(g.importe_estimado)}</td>
                  <td className="p-3">
                    <Etiqueta tono={TONO_PAGO[g.estado_pago] ?? 'neutro'}>{TEXTO_PAGO[g.estado_pago] ?? g.estado_pago}</Etiqueta>
                    <div className="mt-1">
                      <select value={g.estado_pago} onChange={(e) => cambiar(g, 'estado_pago', e.target.value)} aria-label={`Cambiar pago de ${g.nombre_apellido}`} className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs">
                        <option value="no_corresponde">No corresponde</option>
                        <option value="pendiente_pago">Pendiente</option>
                        <option value="pago_informado">Informado</option>
                        <option value="pago_verificado">Verificado</option>
                        <option value="requiere_revision">Revisión</option>
                      </select>
                    </div>
                  </td>
                  <td className="p-3">
                    <button onClick={() => setDetalleId(g.id)} className="text-xs font-medium text-[#0e5c42] underline underline-offset-2">Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-sm text-stone-500">
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs disabled:opacity-40">← Anterior</button>
        <span>Página {pagina + 1} de {Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))} · {filtrados.length} registros</span>
        <button disabled={(pagina + 1) * POR_PAGINA >= filtrados.length} onClick={() => setPagina((p) => p + 1)} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs disabled:opacity-40">Siguiente →</button>
      </div>

      {detalle && (
        <DetalleInvitado ctx={ctx} guest={detalle} onCerrar={() => setDetalleId(null)} />
      )}

      <div className="mt-8 border-t border-stone-200 pt-6">
        <h3 className="font-serifada text-2xl text-[#183b2d]">Familias y grupos</h3>
        <Familias
          guests={ctx.guests}
          groups={ctx.groups}
          members={ctx.members}
          actor={ctx.actor}
          recargar={ctx.recargar}
          resumenGrupos={ctx.m.gruposAgg}
        />
      </div>
    </div>
  );
}

function DetalleInvitado({ ctx, guest: g, onCerrar }: { ctx: Ctx; guest: Guest; onCerrar: () => void }) {
  const acomp = ctx.attendees.filter((a) => a.guest_id === g.id);
  const pagos = ctx.payments.filter((p) => p.guest_id === g.id);
  const hist = ctx.audits.filter((a) => a.registro_id === g.id);
  const grupos = ctx.members.filter((m) => m.guest_id === g.id).map((m) => ctx.groups.find((gr) => gr.id === m.group_id)?.nombre ?? m.group_id);
  return (
    <div className="mt-4 rounded-xl border border-[#d6bd7a]/50 bg-[#fffdf7] p-5" role="dialog" aria-label={`Detalle de ${g.nombre_apellido}`}>
      <Volver onVolver={onCerrar} destino="el listado de invitados (se conservan filtros y página)" />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serifada text-2xl text-[#183b2d]">{g.nombre_apellido}</h3>
          <p className="text-xs text-stone-500">{g.email} · registrado {fechaHora(g.created_at)} · actualizado {fechaHora(g.updated_at)}</p>
        </div>
        <button onClick={onCerrar} className="rounded-full border border-stone-300 px-3 py-1 text-xs">Cerrar</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Etiqueta tono={TONO_ASISTENCIA[g.asistencia] ?? 'neutro'}>Confirmación: {TEXTO_ASISTENCIA[g.asistencia] ?? g.asistencia}</Etiqueta>
        <Etiqueta tono={TONO_PAGO[g.estado_pago] ?? 'neutro'}>Pago: {TEXTO_PAGO[g.estado_pago] ?? g.estado_pago}</Etiqueta>
        <Etiqueta tono="neutro">Autorización: no disponible (requiere esquema)</Etiqueta>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-stone-500">Familia</dt><dd className="font-medium">{g.apellido_familiar ?? '—'}</dd></div>
        <div><dt className="text-stone-500">Grupos</dt><dd className="font-medium">{grupos.length > 0 ? grupos.join(', ') : '—'}</dd></div>
        <div><dt className="text-stone-500">Personas</dt><dd className="font-medium tabular-nums">{g.cantidad_adultos + g.cantidad_menores} ({g.cantidad_adultos} ad. + {g.cantidad_menores} men.)</dd></div>
        <div><dt className="text-stone-500">Importe</dt><dd className="font-medium tabular-nums">{formatoARS(g.importe_estimado)}</dd></div>
        <div><dt className="text-stone-500">Teléfono</dt><dd className="font-medium">{g.telefono ?? '—'}</dd></div>
        <div><dt className="text-stone-500">Restricciones</dt><dd className="font-medium">{g.restricciones ?? '—'}</dd></div>
      </dl>
      {g.observaciones && <p className="mt-2 text-sm"><span className="text-stone-500">Observaciones: </span>{g.observaciones}</p>}
      <h4 className="mt-4 text-sm font-semibold text-stone-700">Acompañantes ({acomp.length})</h4>
      {acomp.length === 0 ? (
        <p className="text-xs text-stone-500">Sin filas de acompañantes registradas.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {acomp.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-2">
              <span className="font-medium">{a.nombre}</span>
              <Etiqueta tono="neutro">{a.es_titular ? 'Titular' : 'Acompañante'}</Etiqueta>
              <span className="text-stone-500">Edad al evento: {a.edad_al_evento ?? 'no indicada'}</span>
              <Etiqueta tono={a.debe_abonar ? 'alerta' : 'ok'}>{a.debe_abonar ? 'Abona' : 'Exento'}</Etiqueta>
            </li>
          ))}
        </ul>
      )}
      <h4 className="mt-4 text-sm font-semibold text-stone-700">Avisos de pago ({pagos.length})</h4>
      {pagos.length === 0 ? (
        <p className="text-xs text-stone-500">Sin avisos vinculados a este invitado.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {pagos.map((p) => (
            <li key={p.id}>{formatoARS(p.monto ?? 0)} · {TEXTO_PAGO[p.estado] ?? p.estado} · informado {fechaHora(p.informado_at)} · verificado {fechaHora(p.verificado_at)}</li>
          ))}
        </ul>
      )}
      <h4 className="mt-4 text-sm font-semibold text-stone-700">Historial ({hist.length})</h4>
      {hist.length === 0 ? (
        <p className="text-xs text-stone-500">Sin cambios auditados para este registro.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs text-stone-600">
          {hist.map((a) => (
            <li key={a.id}>{a.accion} · {a.actor_email} · {fechaHora(a.created_at)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ==================== PAGOS Y SALDOS ==================== */

export function Pagos({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  const [nota, setNota] = useState<string | null>(null);
  const [detallePagoId, setDetallePagoId] = useState<string | null>(null);
  const porGuest = useMemo(() => {
    const mapa = new Map(ctx.guests.map((g) => [g.id, g]));
    return mapa;
  }, [ctx.guests]);
  const responsable = useMemo(() => {
    const mapa = new Map<string, { actor: string; fecha: string }>();
    for (const a of ctx.audits) {
      if (a.entidad !== 'payment_records' || !a.registro_id) continue;
      const prev = mapa.get(a.registro_id);
      if (!prev || a.created_at > prev.fecha) {
        mapa.set(a.registro_id, { actor: a.actor_email ?? '—', fecha: a.created_at });
      }
    }
    return mapa;
  }, [ctx.audits]);

  const marcarPago = async (id: string, estado: string) => {
    const antes = ctx.payments.find((p) => p.id === id);
    const patch: Record<string, unknown> =
      estado === 'pago_verificado'
        ? { estado, verificado_at: new Date().toISOString() }
        : { estado };
    const { error } = await supabase.from('payment_records').update(patch).eq('id', id);
    if (error) {
      setNota(`No se pudo guardar: ${error.message}`);
      return;
    }
    if (antes?.guest_id) {
      const { error: e2 } = await supabase
        .from('guests')
        .update(
          estado === 'pago_verificado'
            ? { estado_pago: estado, pago_verificado_at: new Date().toISOString() }
            : { estado_pago: estado },
        )
        .eq('id', antes.guest_id as string);
      if (e2) setNota(`Aviso actualizado pero el invitado no: ${e2.message}`);
    }
    const aviso = await auditar(ctx.actor, 'payment_records', id, estado, antes, patch);
    if (aviso) setNota(aviso);
    await ctx.recargar();
  };

  const crearAviso = async (guestId: string, monto: number) => {
    const { error } = await supabase.from('payment_records').insert({
      guest_id: guestId,
      monto,
      estado: 'pago_informado',
      medio: 'aviso-admin',
    });
    if (error) {
      setNota(`No se pudo crear el aviso: ${error.message}`);
      return;
    }
    const aviso = await auditar(ctx.actor, 'payment_records', null, 'crear-aviso', null, { guest_id: guestId, monto });
    if (aviso) setNota(aviso);
    await ctx.recargar();
  };

  const card = (titulo: string, valor: string, explicacion: string) => (
    <Tarjeta key={titulo} titulo={titulo} valor={valor} explicacion={explicacion} actualizacion={ctx.actualizacion} />
  );

  return (
    <div>
      {nota && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {nota} <button className="underline" onClick={() => setNota(null)}>Ocultar</button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {card('Importe esperado', formatoARS(m.importeEsperado), 'Suma de importes de confirmados que deben abonar (excluye exentos).')}
        {card('Declarado sin verificar', formatoARS(m.recaudadoDeclarado), 'Suma de avisos informados. No es dinero cobrado.')}
        {card('Recaudación verificada', formatoARS(m.recaudadoVerificado), 'Suma de avisos verificados por el admin (montos declarados atestados, no bancarios).')}
        {card('Saldo pendiente', formatoARS(m.importePendiente), 'Suma estimada de confirmados con pago pendiente.')}
        {card('Por verificar', String(m.informadosRecords.length), 'Avisos informados a la espera de revisión administrativa.')}
        {card('En revisión', String(m.revisionRecords.length), 'Avisos marcados para revisar por diferencias u otros motivos.')}
        {card('Personas al día', `${m.alDiaRegistros} reg. · ${m.alDiaPersonas} pers.`, 'Confirmados exentos o con pago verificado.')}
        {card('Pendientes de conciliación', String(m.diferencias.length + m.multiAviso.length + m.informadosSinAviso.length), 'Diferencias de importe, multi-avisos e informados sin aviso vinculado.')}
      </div>

      <h3 className="font-serifada mt-8 text-2xl text-[#183b2d]">Avisos de pago</h3>
      <p className="text-xs text-stone-500">Estados reales del sistema: pendiente, informado, verificado, revisión, no corresponde. No existe estado “rechazado” ni pagos parciales formales.</p>
      {(() => {
        const sel = detallePagoId ? ctx.payments.find((x) => x.id === detallePagoId) ?? null : null;
        if (sel) {
          const p = sel;
          const g = porGuest.get(p.guest_id);
          const r = responsable.get(p.id);
          const hist = ctx.audits.filter((a) => a.registro_id === p.id);
          return (
            <div className="mt-3 rounded-xl border border-[#d6bd7a]/50 bg-[#fffdf7] p-5" role="dialog" aria-label="Detalle del aviso de pago">
              <Volver onVolver={() => setDetallePagoId(null)} destino="el listado de avisos" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-serifada text-2xl text-[#183b2d]">{g?.nombre_apellido ?? p.guest_id}</p>
                  <p className="text-xs text-stone-500">{g?.email ?? ''}{g?.apellido_familiar ? ` · Flia. ${g.apellido_familiar}` : ''}</p>
                </div>
                <Etiqueta tono={TONO_PAGO[p.estado] ?? 'neutro'}>{TEXTO_PAGO[p.estado] ?? p.estado}</Etiqueta>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <div><dt className="text-stone-500">Registro</dt><dd className="font-mono text-[11px]">{p.id}</dd></div>
                <div><dt className="text-stone-500">Esperado</dt><dd className="font-medium tabular-nums">{formatoARS(g?.importe_estimado ?? 0)}</dd></div>
                <div><dt className="text-stone-500">Informado</dt><dd className="font-medium tabular-nums">{formatoARS(p.monto ?? 0)}</dd></div>
                <div><dt className="text-stone-500">Verificado</dt><dd className="font-medium tabular-nums">{p.estado === 'pago_verificado' ? formatoARS(p.monto ?? 0) : '—'}</dd></div>
                <div><dt className="text-stone-500">Personas cubiertas</dt><dd className="font-medium tabular-nums">{g ? g.cantidad_adultos + g.cantidad_menores : '—'}</dd></div>
                <div><dt className="text-stone-500">Informado el</dt><dd>{fechaHora(p.informado_at)}</dd></div>
                <div><dt className="text-stone-500">Verificado el</dt><dd>{fechaHora(p.verificado_at)}</dd></div>
                <div><dt className="text-stone-500">Responsable</dt><dd>{r ? `${r.actor} · ${fechaHora(r.fecha)}` : 'Sin registro (requiere esquema: verificado_por)'}</dd></div>
                <div><dt className="text-stone-500">Medio / ref.</dt><dd>{(p.medio as string) ?? '—'}</dd></div>
                <div><dt className="text-stone-500">Enlace individual</dt><dd className="font-mono text-[11px]">{`#ya-abone/${(p.token_accion as string) ?? '—'}`}</dd></div>
              </dl>
              {g && (
                <button onClick={() => ctx.ir('invitados', { q: g.email })} className="mt-3 text-xs font-medium text-[#0e5c42] underline underline-offset-2">
                  Abrir invitado →
                </button>
              )}
              <div className="mt-3 flex gap-2">
                <button onClick={() => marcarPago(p.id, 'pago_verificado')} className="rounded-full bg-[#183b2d] px-4 py-2 text-xs font-medium text-white hover:bg-[#0e241b]">Verificar (acción administrativa)</button>
                <button onClick={() => marcarPago(p.id, 'requiere_revision')} className="rounded-full border border-stone-300 px-4 py-2 text-xs font-medium">Enviar a revisión</button>
              </div>
              <h4 className="mt-4 text-sm font-semibold text-stone-700">Historial del aviso ({hist.length})</h4>
              {hist.length === 0 ? (
                <p className="text-xs text-stone-500">Sin movimientos auditados.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-stone-600">
                  {hist.map((a) => (
                    <li key={a.id}>{a.accion} · {a.actor_email} · {fechaHora(a.created_at)}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        if (ctx.payments.length === 0) {
          return <div className="mt-3"><Vacio texto="Todavía no hay avisos de pago registrados." /></div>;
        }
        return (
          <ul className="mt-3 space-y-2">
            {ctx.payments.map((p) => {
              const g = porGuest.get(p.guest_id);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setDetallePagoId(p.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-[#d6bd7a]"
                  >
                    <span>
                      <span className="block text-sm font-medium text-stone-900">{g?.nombre_apellido ?? p.guest_id}</span>
                      <span className="block text-xs tabular-nums text-stone-500">{formatoARS(p.monto ?? 0)} · informado {fechaCorta(p.informado_at)}</span>
                    </span>
                    <Etiqueta tono={TONO_PAGO[p.estado] ?? 'neutro'}>{TEXTO_PAGO[p.estado] ?? p.estado}</Etiqueta>
                  </button>
                </li>
              );
            })}
          </ul>
        );
      })()}

      <h3 className="font-serifada mt-8 text-2xl text-[#183b2d]">Pendientes de conciliación</h3>
      {m.diferencias.length + m.multiAviso.length + m.informadosSinAviso.length + m.verificadosSinRegistro.length === 0 ? (
        <div className="mt-3"><Vacio texto="Sin diferencias ni casos sin conciliar." /></div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {m.diferencias.map((d) => (
            <li key={d.pagoId} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <Etiqueta tono="alerta">Diferencia de importe</Etiqueta>
              <p className="mt-1 text-stone-800">{d.nombre} · esperado {formatoARS(d.esperado)}, informado {formatoARS(d.informado)}. No distribuir: conciliar manualmente.</p>
            </li>
          ))}
          {m.multiAviso.map((g) => (
            <li key={g.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <Etiqueta tono="alerta">Multi-aviso</Etiqueta>
              <p className="mt-1 text-stone-800">{g.nombre_apellido}: varios avisos. No sumar dos veces; conciliar cuál rige.</p>
            </li>
          ))}
          {m.informadosSinAviso.map((g) => (
            <li key={g.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <Etiqueta tono="info">Informado sin aviso</Etiqueta>
              <p className="mt-1 text-stone-800">{g.nombre_apellido} · {formatoARS(g.importe_estimado)}.</p>
              <button onClick={() => crearAviso(g.id, g.importe_estimado ?? 0)} className="mt-2 rounded-full border border-stone-400 px-3 py-1 text-xs font-medium">Crear aviso para verificar</button>
            </li>
          ))}
          {m.verificadosSinRegistro.map((g) => (
            <li key={g.id} className="rounded-xl border border-red-300 bg-red-50 p-3">
              <Etiqueta tono="error">Verificado sin registro</Etiqueta>
              <p className="mt-1 text-stone-800">{g.nombre_apellido}: figura verificado sin aviso verificado. Revisar antes de contar su recaudación.</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ==================== VERIFICADOS Y AUTORIZADOS ==================== */

export function Verificados({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  return (
    <div>
      <AvisoEsquema
        texto="El esquema no tiene estado de autorización, responsable de verificación ni observaciones administrativas (propuesta SQL pendiente de aprobación). Nada aquí se muestra como autorizado: la autorización será siempre una acción explícita del admin, nunca automática."
      />
      <h3 className="font-serifada mt-6 text-2xl text-[#183b2d]">Pagos verificados ({m.verificadosGuests.length})</h3>
      {m.verificadosGuests.length === 0 ? (
        <div className="mt-3"><Vacio texto="Aún no hay invitados con pago verificado." /></div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-[#183b2d] text-left text-xs uppercase tracking-wider text-[#f8f4e9]">
                  <th className="p-3">Nombre</th><th className="p-3">Familia</th><th className="p-3">Personas</th>
                  <th className="p-3">Importe</th><th className="p-3">Verificado el</th><th className="p-3">Autorización</th>
                </tr>
              </thead>
              <tbody>
                {m.verificadosGuests.map((g) => (
                  <tr key={g.id} className="border-t border-stone-200">
                    <td className="p-3 font-medium">{g.nombre_apellido}<p className="text-xs font-normal text-stone-500">{g.email}</p></td>
                    <td className="p-3">{g.apellido_familiar ?? '—'}</td>
                    <td className="p-3 tabular-nums">{g.cantidad_adultos + g.cantidad_menores}</td>
                    <td className="p-3 tabular-nums">{formatoARS(g.importe_estimado)}</td>
                    <td className="p-3 text-xs tabular-nums">{fechaHora(g.pago_verificado_at)}</td>
                    <td className="p-3"><Etiqueta tono="alerta">Autorización: pendiente de esquema</Etiqueta></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => descargarCsv(m.verificadosGuests as unknown as Array<Record<string, unknown>>, 'verificados.csv')}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#68785b] px-4 py-2 text-xs font-medium text-[#183b2d]"
          >
            <Download size={14} /> Exportar CSV
          </button>
        </>
      )}
      <h3 className="font-serifada mt-8 text-2xl text-[#183b2d]">Menores exentos ({m.exentosInvitados.length} registros · {m.exentos.length} personas)</h3>
      <p className="text-xs text-stone-500">Menores de {ctx.ajustes.edad_minima_paga} años al día del evento. No generan deuda y no quedan bloqueados por falta de pago; su autorización sigue el mismo circuito explícito pendiente de esquema.</p>
      {m.exentosInvitados.length === 0 ? (
        <div className="mt-3"><Vacio texto="Sin menores exentos registrados." /></div>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {m.exentosInvitados.map((g) => (
            <li key={g.id} className="rounded-lg border border-stone-200 bg-white p-3">
              <span className="font-medium">{g.nombre_apellido}</span>{' '}
              <span className="text-stone-500">{g.email}</span>{' '}
              <Etiqueta tono="ok">Exento</Etiqueta> <Etiqueta tono="alerta">Autorización: pendiente de esquema</Etiqueta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ==================== PENDIENTES ==================== */

function BloquePendientes({
  titulo,
  items,
  vacio,
  ctx,
}: {
  titulo: string;
  items: Array<{ id: string; motivo: string; texto: string; tab: SeccionId; preset?: { q?: string; fAsist?: string; fPago?: string } }>;
  vacio: string;
  ctx: Ctx;
}) {
  return (
    <div className="mt-6">
      <h3 className="font-serifada text-2xl text-[#183b2d]">{titulo} ({items.length})</h3>
      {items.length === 0 ? (
        <div className="mt-2"><Vacio texto={vacio} /></div>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm">
              <div>
                <Etiqueta tono="alerta">{it.motivo}</Etiqueta>
                <p className="mt-1 text-stone-800">{it.texto}</p>
              </div>
              <button onClick={() => ctx.ir(it.tab, it.preset)} className="text-xs font-medium text-[#0e5c42] underline underline-offset-2">Abrir registro →</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Pendientes({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  return (
    <div>
      <BloquePendientes
        ctx={ctx}
        titulo="Sin respuesta"
        vacio="Todos respondieron o no hay registros."
        items={m.pendientesRespuesta.map((g) => ({
          id: g.id, motivo: 'Confirmación pendiente', texto: `${g.nombre_apellido} · registrado ${fechaCorta(g.created_at)}.`,
          tab: 'invitados', preset: { q: g.email },
        }))}
      />
      <BloquePendientes
        ctx={ctx}
        titulo="Confirmados con saldo"
        vacio="Sin saldos pendientes."
        items={m.sinPagoRegistros.map((g) => ({
          id: g.id, motivo: 'Pago no informado', texto: `${g.nombre_apellido} · debe ${formatoARS(g.importe_estimado)}.`,
          tab: 'pagos',
        }))}
      />
      <BloquePendientes
        ctx={ctx}
        titulo="Por verificar"
        vacio="Sin avisos pendientes de verificación."
        items={m.informadosRecords.map((p) => ({
          id: p.id, motivo: 'Pago pendiente de verificación', texto: `${nombreGuest(ctx, p.guest_id)} · informado ${formatoARS(p.monto ?? 0)} el ${fechaCorta(p.informado_at)}.`,
          tab: 'pagos',
        }))}
      />
      <BloquePendientes
        ctx={ctx}
        titulo="Diferencias y conciliación"
        vacio="Sin diferencias."
        items={[
          ...m.diferencias.map((d) => ({
            id: d.pagoId, motivo: 'Diferencia de importe', texto: `${d.nombre}: esperado ${formatoARS(d.esperado)}, informado ${formatoARS(d.informado)}.`,
            tab: 'pagos' as SeccionId,
          })),
          ...m.multiAviso.map((g) => ({
            id: g.id, motivo: 'Múltiples avisos', texto: `${g.nombre_apellido}: conciliar sin sumar dos veces.`,
            tab: 'pagos' as SeccionId,
          })),
          ...m.informadosSinAviso.map((g) => ({
            id: g.id, motivo: 'Informado sin aviso', texto: `${g.nombre_apellido}: crear aviso para poder verificar.`,
            tab: 'pagos' as SeccionId,
          })),
        ]}
      />
      <BloquePendientes
        ctx={ctx}
        titulo="Requieren revisión"
        vacio="Sin casos en revisión."
        items={[
          ...m.revisionRecords.map((p) => ({
            id: p.id, motivo: 'Caso en revisión', texto: `${nombreGuest(ctx, p.guest_id)} · aviso ${formatoARS(p.monto ?? 0)}.`,
            tab: 'pagos' as SeccionId,
          })),
          ...m.conteoIncoherente.map((c, i) => ({
            id: `c-${i}`, motivo: 'Conteo inconsistente', texto: c.detalle,
            tab: 'invitados' as SeccionId,
          })),
        ]}
      />
      <BloquePendientes
        ctx={ctx}
        titulo="Verificado sin autorización"
        vacio="Sin casos (la autorización aún no existe en el esquema)."
        items={[]}
      />
      <div className="mt-6">
        <h3 className="font-serifada text-2xl text-[#183b2d]">Recordatorios ({m.candidatosRecordatorio.length})</h3>
        <p className="text-xs text-stone-500">
          Candidatos reales (confirmado + pago pendiente + importe &gt; 0). Automatización no activada: no se envió nada.
          {m.proximaFechaRecordatorio ? ` Próxima fecha calculada: ${m.proximaFechaRecordatorio}.` : ' Sin fechas calculables (sin envíos previos).'}
        </p>
      </div>
    </div>
  );
}

/* ==================== ASISTENTE (chat persistente + informes) ==================== */

const SUGERENCIAS = [
  '¿Cuánto falta cobrar?',
  'Pagos por verificar',
  'Familias con saldo',
  '¿Qué resuelvo primero?',
  'Generar informe de pagos',
];

export function Asistente({ ctx }: { ctx: Ctx }) {
  const actor = ctx.actor ?? 'sin-sesion';
  const [chats, setChats] = useState<Conversacion[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [entrada, setEntrada] = useState('');
  const [contexto, setContexto] = useState<ContextoChat>({});
  const [procesando, setProcesando] = useState(false);
  const [fallo, setFallo] = useState<{ texto: string } | null>(null);
  const [memoria, setMemoria] = useState(false);
  const [menuMovil, setMenuMovil] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [tituloTmp, setTituloTmp] = useState('');
  const [informe, setInforme] = useState<InformeArmado | null>(null);
  const [tipoInforme, setTipoInforme] = useState<InformeArmado['tipo']>('general');
  const finRef = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<'remoto' | 'local' | 'desconocido'>('desconocido');
  const [notaSync, setNotaSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [mapa, setMapa] = useState<MapaSync>({});
  const chatsRef = useRef<Conversacion[]>([]);
  const mapaRef = useRef<MapaSync>({});
  chatsRef.current = chats;
  mapaRef.current = mapa;

  useEffect(() => {
    const { chats: c, soloMemoria } = cargarChats(actor);
    setMemoria(soloMemoria);
    setMapa(cargarMapa(actor).mapa);
    if (c.length === 0) {
      const n = nuevaConversacion();
      setChats([n]);
      setChatId(n.id);
    } else {
      setChats(c);
      setChatId(c[0].id);
    }
    setContexto({});
    setInforme(null);
    setFallo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  // Detección del backend (solo lectura: no escribe nada).
  useEffect(() => {
    let vivo = true;
    setModo('desconocido');
    detectarModo().then((r) => {
      if (!vivo) return;
      if (r.modo === 'remoto') {
        setModo('remoto');
        setNotaSync(null);
      } else {
        setModo('local');
        setNotaSync(r.detalle ?? 'Historial solo en este navegador.');
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatId, chats.length]);

  const chat = chats.find((c) => c.id === chatId) ?? null;

  const persistir = (lista: Conversacion[]) => {
    setChats(lista);
    if (!guardarChats(actor, lista)) setMemoria(true);
  };

  const datos: DatosAsistente = {
    m: ctx.m,
    ajustes: ctx.ajustes,
    stamp: ctx.actualizacion,
  };
  const erroresClaves = Object.keys(ctx.erroresCarga);
  const etiquetaVista =
    ctx.vistaModalidad === 'todas'
      ? null
      : (ctx.modalidades.find((x) => x.codigo === ctx.vistaModalidad)?.nombre ?? ctx.vistaModalidad);
  const logsLite = ctx.erroresCarga.logs
    ? null
    : ctx.logs.map((l) => ({
        destinatario: l.destinatario,
        estado: l.estado,
        error: l.error ?? null,
        enviado_at: l.enviado_at ?? null,
        created_at: l.created_at,
      }));
  const auditsMini = ctx.audits.map((a) => ({
    accion: a.accion,
    entidad: a.entidad,
    actor_email: a.actor_email,
    created_at: a.created_at,
  }));

  const agregarAsistente = (
    lista: Conversacion[],
    id: string,
    msg: Omit<Mensaje, 'id' | 'rol' | 'ts'> & { rol?: 'asistente' },
  ): Conversacion[] =>
    lista.map((c) =>
      c.id === id
        ? {
            ...c,
            mensajes: [
              ...c.mensajes,
              { id: crypto.randomUUID(), rol: 'asistente' as const, ts: new Date().toISOString(), ...msg },
            ],
            actualizada: new Date().toISOString(),
          }
        : c,
    );

  const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const guardaMapa = (mm: MapaSync) => {
    mapaRef.current = mm;
    setMapa(mm);
    guardarMapa(actor, mm);
  };

  /**
   * Vuelca un chat al servidor (crea remoto si falta, sube faltantes).
   * Idempotente: reintentar no duplica (ids estables + upsert).
   * Normaliza ids heredados no-UUID a UUID antes de subir.
   */
  const volcarRemoto = async (chatId: string): Promise<boolean> => {
    let chat = chatsRef.current.find((c) => c.id === chatId);
    if (!chat) return true;
    if (chat.mensajes.some((x) => !ES_UUID.test(x.id))) {
      const normalizado: Conversacion = {
        ...chat,
        mensajes: chat.mensajes.map((x) => (ES_UUID.test(x.id) ? x : { ...x, id: crypto.randomUUID() })),
      };
      const reac = chatsRef.current.map((c) => (c.id === chatId ? normalizado : c));
      chatsRef.current = reac;
      setChats(reac);
      guardarChats(actor, reac);
      chat = normalizado;
    }
    let mm = mapaRef.current[chatId];
    if (!mm) {
      const remoteId = crypto.randomUUID();
      const rc = await crearConversacionRemota(remoteId, chat.titulo);
      if (!rc.ok) return false;
      mm = { remoteId, syncedMsgIds: [] };
      guardaMapa({ ...mapaRef.current, [chatId]: mm });
    }
    const falt = mensajesFaltantes(chat, { [chatId]: mm });
    if (falt.length === 0) return true;
    const rs = await subirMensajes(mm.remoteId, falt);
    if (!rs.ok) return false;
    const cur = mapaRef.current[chatId] ?? mm;
    guardaMapa({
      ...mapaRef.current,
      [chatId]: { remoteId: cur.remoteId, syncedMsgIds: [...cur.syncedMsgIds, ...falt.map((x) => x.id)] },
    });
    return true;
  };

  const pendientesSync = chats.reduce((a, c) => a + mensajesFaltantes(c, mapa).length, 0);

  const sincronizarTodo = async () => {
    if (modo !== 'remoto') return;
    setSincronizando(true);
    setSyncError(null);
    try {
      for (const c of chatsRef.current) {
        if (c.mensajes.length === 0 && !mapaRef.current[c.id]) continue;
        const ok = await volcarRemoto(c.id);
        if (!ok) throw new Error('No se pudo subir una conversación (se conserva local).');
      }
      const rl = await listarRemoto();
      if (!rl.ok) throw new Error(rl.error ?? 'No se pudo leer el servidor.');
      // Registrar en el mapa las llegadas de otros dispositivos (evita duplicarlas al subir).
      const nm: MapaSync = { ...mapaRef.current };
      for (const e of rl.entradas) {
        const conocida = Object.entries(nm).some(([lid, mm]) => mm.remoteId === e.id || lid === e.id);
        if (!conocida) nm[e.id] = { remoteId: e.id, syncedMsgIds: e.mensajes.map((x) => x.id) };
      }
      const fusion = fusionarConversaciones(chatsRef.current, rl.entradas, nm);
      chatsRef.current = fusion;
      setChats(fusion);
      guardarChats(actor, fusion);
      // Reintentar borrados pendientes: entradas del mapa sin chat local.
      for (const [lid, mm] of Object.entries({ ...nm })) {
        if (!fusion.some((c) => c.id === lid)) {
          const del = await eliminarRemoto(mm.remoteId);
          if (del.ok) delete nm[lid];
        }
      }
      // Marcar sincronizado lo presente en ambos lados.
      const remotos = new Map(rl.entradas.map((e) => [e.id, e]));
      for (const [lid, mm] of Object.entries(nm)) {
        const rem = remotos.get(mm.remoteId);
        if (!rem) continue;
        const ids = new Set(rem.mensajes.map((x) => x.id));
        const chat = fusion.find((c) => c.id === lid);
        if (!chat) continue;
        nm[lid] = { remoteId: mm.remoteId, syncedMsgIds: chat.mensajes.filter((x) => ids.has(x.id)).map((x) => x.id) };
      }
      guardaMapa(nm);
      setNotaSync(`Sincronizado ${new Date().toLocaleString('es-AR')}.`);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error de sincronización');
    } finally {
      setSincronizando(false);
    }
  };

  const enviar = async (textoLibre?: string) => {
    const texto = (textoLibre ?? entrada).trim().slice(0, 2000);
    if (!chat || !texto || procesando) return;
    const msgU: Mensaje = {
      // UUID v4: válido para local y remoto (permite sincronizar sin reasignar).
      id: crypto.randomUUID(),
      rol: 'usuario',
      texto,
      ts: new Date().toISOString(),
    };
    let lista = chats.map((c) =>
      c.id === chat.id
        ? {
            ...c,
            titulo: c.mensajes.length === 0 ? titularDesde(texto) : c.titulo,
            mensajes: [...c.mensajes, msgU],
            actualizada: new Date().toISOString(),
          }
        : c,
    );
    persistir(lista);
    setEntrada('');
    setFallo(null);
    setProcesando(true);
    await new Promise((r) => setTimeout(r, 180));
    try {
      // Pedido directo de PDF: regenera el último informe (o el general).
      if (/^(generar |quiero |dame |descargar )?(pdf|imprimir|descargar)( el informe|lo)?$/i.test(texto.trim())) {
        armarInforme(tipoInforme, lista);
        return;
      }
      const { r, contexto: ctx2 } = responderLibre(texto, datos, auditsMini, contexto, { logs: logsLite });
      setContexto(ctx2);
      if ('aclaracion' in r) {
        persistir(
          agregarAsistente(lista, chat.id, {
            texto: r.aclaracion,
            lineas: r.sugerencias.map((s) => `· ${s}`),
            metodo: 'Sin clasificación confiable: se pide aclaración en vez de inventar.',
            tema: 'aclaracion',
          }),
        );
        return;
      }
      if (r.tema.startsWith('informe-')) {
        const pedido = r.tema.replace('informe-', '') as InformeArmado['tipo'];
        const tipos: Array<InformeArmado['tipo']> = ['general', 'pagos', 'familias', 'verificados', 'actividad'];
        const tipo: InformeArmado['tipo'] = tipos.includes(pedido) ? pedido : 'general';
        setTipoInforme(tipo);
        armarInforme(tipo, lista);
        return;
      }
      persistir(
        agregarAsistente(lista, chat.id, {
          texto: r.titulo,
          lineas: r.lineas,
          metodo: r.metodo,
          destino: r.destino ? { tab: r.destino.tab, preset: r.destino.preset, texto: r.destino.texto } : undefined,
          tema: r.tema,
        }),
      );
    } catch (e) {
      // El mensaje del usuario queda intacto; se puede reintentar.
      setFallo({ texto });
    } finally {
      setProcesando(false);
      // Volcado best-effort: lo local ya está guardado; si falla, queda pendiente.
      if (modo === 'remoto') {
        void volcarRemoto(chat.id).then((ok) => {
          if (!ok) setSyncError('Guardado local OK; la sincronización quedó pendiente.');
        });
      }
    }
  };

  const armarInforme = (tipo: InformeArmado['tipo'], base?: Conversacion[]) => {
    const lista = base ?? chats;
    const target = lista.find((c) => c.id === chatId);
    if (!target) return;
    const problemas = verificarConsistencia(ctx.m);
    if (problemas.length > 0) {
      persistir(
        agregarAsistente(lista, target.id, {
          texto: 'No genero el informe: los totales no son consistentes.',
          lineas: problemas,
          metodo: 'Chequeo previo obligatorio; ante duda, no se emite documento.',
          tema: 'informe-bloqueado',
        }),
      );
      return;
    }
    const nombreVista =
      ctx.vistaModalidad === 'todas'
        ? undefined
        : (ctx.modalidades.find((x) => x.codigo === ctx.vistaModalidad)?.nombre ?? ctx.vistaModalidad);
    const doc = construirInforme(tipo, datos, auditsMini, nombreVista);
    setTipoInforme(tipo);
    setInforme(doc);
    persistir(
      agregarAsistente(lista, target.id, {
        texto: `Informe “${tipo}” generado con datos de ${doc.stamp}.`,
        lineas: doc.secciones.map((s) => `· ${s.titulo}`),
        metodo: 'Constructor de informes sobre Metricas; totales verificados antes de emitir.',
        tema: `informe-${tipo}`,
      }),
    );
  };

  const reintentar = () => {
    if (!fallo) return;
    setFallo(null);
    void enviar(fallo.texto);
  };

  const nuevoChat = () => {
    const n = nuevaConversacion();
    persistir([n, ...chats]);
    setChatId(n.id);
    setContexto({});
    setInforme(null);
    setMenuMovil(false);
  };

  const eliminarChat = (id: string) => {
    if (!window.confirm('Eliminar esta conversación con todos sus mensajes?')) return;
    const resto = chats.filter((c) => c.id !== id);
    const final = resto.length > 0 ? resto : [nuevaConversacion()];
    persistir(final);
    if (chatId === id) setChatId(final[0].id);
    const mm = mapaRef.current[id];
    if (mm) {
      const nm = { ...mapaRef.current };
      delete nm[id];
      guardaMapa(nm);
      if (modo === 'remoto') {
        void eliminarRemoto(mm.remoteId).then((r) => {
          if (!r.ok) {
            guardaMapa({ ...mapaRef.current, [id]: mm });
            setSyncError(`No se pudo borrar en el servidor (${r.error ?? ''}); se reintentará al sincronizar.`);
          }
        });
      }
    }
  };

  const guardarTitulo = (id: string) => {
    const t = tituloTmp.trim().slice(0, 60);
    if (!t) {
      setEditando(null);
      return;
    }
    persistir(chats.map((c) => (c.id === id ? { ...c, titulo: t } : c)));
    setEditando(null);
    const mm = mapaRef.current[id];
    if (modo === 'remoto' && mm) {
      void renombrarRemoto(mm.remoteId, t).then((r) => {
        if (!r.ok) setSyncError(`Título guardado local; no se pudo renombrar en el servidor: ${r.error ?? ''}`);
      });
    }
  };

  const abrirChat = (id: string) => {
    setChatId(id);
    setContexto({});
    setInforme(null);
    setMenuMovil(false);
  };

  const listaChats = (
    <>
      <button
        onClick={nuevoChat}
        className="w-full rounded-full bg-[#183b2d] px-3 py-2 text-xs font-medium text-white hover:bg-[#0e241b]"
      >
        + Nueva conversación
      </button>
      <ul className="mt-2 space-y-1">
        {chats.map((c) => (
          <li key={c.id}>
            <div
              className={`rounded-lg px-2 py-1.5 ${c.id === chatId ? 'bg-[#d6bd7a]/30' : 'hover:bg-stone-100'}`}
            >
              {editando === c.id ? (
                <span className="flex gap-1">
                  <input
                    value={tituloTmp}
                    onChange={(e) => setTituloTmp(e.target.value)}
                    aria-label="Título de la conversación"
                    className="min-w-0 flex-1 rounded border border-stone-300 px-1 py-0.5 text-xs"
                  />
                  <button onClick={() => guardarTitulo(c.id)} className="text-xs font-medium text-[#0e5c42]">OK</button>
                </span>
              ) : (
                <button onClick={() => abrirChat(c.id)} className="block w-full truncate text-left text-xs font-medium text-stone-800">
                  {c.titulo}
                </button>
              )}
              <span className="flex items-center justify-between text-[10px] text-stone-400">
                <span>{fechaCorta(c.actualizada)} · {c.mensajes.length} msg{c.mensajes.length === 1 ? '' : 's'}</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => { setEditando(c.id); setTituloTmp(c.titulo); }}
                    className="underline"
                    aria-label={`Renombrar ${c.titulo}`}
                  >
                    Renombrar
                  </button>
                  <button onClick={() => eliminarChat(c.id)} className="underline" aria-label={`Eliminar ${c.titulo}`}>
                    Eliminar
                  </button>
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div>
      {erroresClaves.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900" role="alert">
          Consultas con error ({erroresClaves.join(', ')}): las respuestas pueden estar incompletas. Usá “Actualizar” en el encabezado.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs" role="status">
        <span className="font-medium text-stone-700">Sincronización:</span>
        {modo === 'desconocido' ? (
          <span className="text-stone-500">Comprobando servidor…</span>
        ) : modo === 'local' ? (
          <span className="text-stone-600">Solo en este navegador{notaSync ? ` · ${notaSync}` : ''}</span>
        ) : (
          <span className="font-medium text-emerald-800">
            ● Servidor{pendientesSync > 0 ? ` · ${pendientesSync} mensaje(s) pendiente(s)` : ' · al día'}
          </span>
        )}
        {syncError && <span className="text-red-700">· Error: {syncError}</span>}
        <span className="ml-auto flex gap-2">
          <button
            onClick={() => void sincronizarTodo()}
            disabled={sincronizando || modo !== 'remoto'}
            title={modo !== 'remoto' ? 'Requiere la migración 0005 aplicada en Supabase' : 'Subir pendientes, migrar historial local y traer novedades'}
            className="rounded-full border border-stone-300 px-3 py-1 disabled:opacity-40"
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          {syncError && (
            <button onClick={() => void sincronizarTodo()} className="rounded-full border border-red-300 px-3 py-1 text-red-800">
              Reintentar
            </button>
          )}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[250px_1fr]">
        <aside className="hidden rounded-xl border border-stone-200 bg-white p-3 lg:block" aria-label="Historial de conversaciones">
          {listaChats}
        </aside>
        <div className="flex min-h-[480px] flex-col rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 p-3">
            <div>
              <h3 className="font-serifada text-xl text-[#183b2d]">Asistente de gestión XV-ANTONELLA</h3>
              <p className="text-[11px] text-stone-500">
                Motor de consultas estructuradas sobre datos reales (sin modelo externo). Solo lectura: no verifica,
                autoriza, modifica ni envía. Datos: {ctx.actualizacion}.
                {etiquetaVista && (
                  <> Vista filtrada: <strong>{etiquetaVista}</strong> (respuestas e informes usan ese recorte).</>
                )}
                {memoria && ' Historial solo en esta sesión (almacenamiento no disponible).'}
              </p>
            </div>
            <button onClick={() => setMenuMovil(true)} className="rounded-lg border border-stone-300 px-3 py-2 text-xs lg:hidden" aria-label="Abrir historial">
              Chats
            </button>
          </div>

          <div className="max-h-[52vh] flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {!chat || chat.mensajes.length === 0 ? (
              <p className="py-8 text-center text-xs text-stone-500">
                Escribí una pregunta o elegí una sugerida. El historial persiste por administradora en este navegador.
              </p>
            ) : (
              chat.mensajes.map((msg) =>
                msg.rol === 'usuario' ? (
                  <div key={msg.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#183b2d] px-3 py-2 text-sm text-white">
                    <p>{msg.texto}</p>
                    <p className="mt-1 text-right text-[10px] text-white/60">{fechaHora(msg.ts)}</p>
                  </div>
                ) : (
                  <div key={msg.id} className="mr-auto max-w-[95%] rounded-2xl rounded-bl-sm border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <p className="font-medium">{msg.texto}</p>
                    {msg.lineas && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                        {msg.lineas.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    )}
                    {msg.metodo && <p className="mt-1 text-[10px] text-stone-400">Cómo: {msg.metodo}</p>}
                    {msg.destino && (
                      <button
                        onClick={() => ctx.ir(msg.destino!.tab as SeccionId, msg.destino!.preset)}
                        className="mt-1 text-xs font-medium text-[#0e5c42] underline underline-offset-2"
                      >
                        {msg.destino.texto ?? 'Abrir respaldo'} →
                      </button>
                    )}
                    <p className="mt-1 text-[10px] text-stone-400">{fechaHora(msg.ts)}</p>
                  </div>
                ),
              )
            )}
            {procesando && (
              <div className="mr-auto rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500" aria-label="Generando respuesta">
                Analizando datos…
              </div>
            )}
            {fallo && (
              <div className="mr-auto rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>No se pudo generar la respuesta; tu mensaje quedó guardado.</p>
                <button onClick={reintentar} className="mt-1 text-xs font-medium underline">Reintentar</button>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <div className="border-t border-stone-200 p-3">
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => void enviar(s)}
                  className="rounded-full border border-[#68785b] px-3 py-1.5 text-xs font-medium text-[#183b2d] hover:bg-[#68785b]/10"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              <input
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder="Escribí tu pregunta…"
                aria-label="Escribir pregunta al asistente"
                className="min-h-[44px] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={procesando || !entrada.trim()}
                className="min-h-[44px] rounded-full bg-[#183b2d] px-5 text-xs font-medium text-white disabled:opacity-40"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      </div>

      {menuMovil && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Historial de chats">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuMovil(false)} />
          <div className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-stone-900">Conversaciones</p>
              <button onClick={() => setMenuMovil(false)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs" aria-label="Cerrar historial">
                Cerrar
              </button>
            </div>
            {listaChats}
          </div>
        </div>
      )}

      {informe && <InformeDoc informe={informe} onCerrar={() => setInforme(null)} />}

      {ctx.m.inconsistencias.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Alertas de datos ({ctx.m.inconsistencias.length})</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
            {ctx.m.inconsistencias.slice(0, 10).map((c, i) => (
              <li key={i}>[{c.tipo}] {c.detalle}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Documento de informe (imprimible → PDF) ---------- */

function InformeDoc({ informe, onCerrar }: { informe: InformeArmado; onCerrar: () => void }) {
  useEffect(() => {
    document.body.classList.add('imprimiendo-informe');
    return () => document.body.classList.remove('imprimiendo-informe');
  }, []);

  return (
    <div className="zona-informe mt-4 rounded-xl border border-stone-300 bg-white p-6">
      <div className="no-imprimir mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-full bg-[#183b2d] px-5 py-2 text-xs font-medium text-white"
        >
          Imprimir / Guardar PDF
        </button>
        <button onClick={onCerrar} className="rounded-full border border-stone-300 px-5 py-2 text-xs">
          Cerrar informe
        </button>
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">XV-ANTONELLA · Informe {informe.tipo}</p>
      <h3 className="font-serifada mt-1 text-3xl text-[#183b2d]">{informe.titulo}</h3>
      <p className="mt-1 text-xs text-stone-500">
        Generado {informe.stamp} · Datos actuales de Supabase · Montos en ARS.
      </p>
      {informe.secciones.map((s, i) => (
        <section key={i} className="mt-5">
          <h4 className="border-b border-stone-300 pb-1 font-medium text-stone-900">{s.titulo}</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-800">
            {s.lineas.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
          {s.tabla && (
            <table className="mt-2 w-full text-xs">
              <caption className="py-1 text-left font-medium text-stone-700">{s.tabla.titulo}</caption>
              <thead>
                <tr className="border-b border-stone-400 text-left">
                  {s.tabla.cols.map((c) => (
                    <th key={c} className="py-1 pr-3 font-semibold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.tabla.filas.map((f, k) => (
                  <tr key={k} className="border-b border-stone-200">
                    {f.map((v, q) => (
                      <td key={q} className="py-1 pr-3 tabular-nums">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      <section className="mt-5">
        <h4 className="border-b border-stone-300 pb-1 font-medium text-stone-900">Limitaciones</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-stone-600">
          {informe.limitaciones.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ==================== HISTORIAL ==================== */

export function Historial({ ctx }: { ctx: Ctx }) {
  const [ent, setEnt] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const entidades = useMemo(
    () => [...new Set(ctx.audits.map((a) => a.entidad))].sort(),
    [ctx.audits],
  );
  const lista = ent ? ctx.audits.filter((a) => a.entidad === ent) : ctx.audits;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-stone-500" htmlFor="fent">Entidad:</label>
        <select id="fent" value={ent} onChange={(e) => setEnt(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">Todas ({ctx.audits.length})</option>
          {entidades.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs text-stone-500">Muestra acciones administrativas registradas con actor y fecha. Sin punto de comparación persistido: se informa actividad reciente, no “cambios desde la última revisión”.</p>
      {(() => {
        const sel = detalleId ? lista.find((x) => x.id === detalleId) ?? null : null;
        if (sel) {
          const a = sel as AuditRow & { anteriores?: unknown; nuevos?: unknown };
          return (
            <div className="mt-3 rounded-xl border border-[#d6bd7a]/50 bg-[#fffdf7] p-5" role="dialog" aria-label="Detalle del registro de auditoría">
              <Volver onVolver={() => setDetalleId(null)} destino="el historial" />
              <p className="mt-3 text-sm text-stone-900"><strong>{a.accion}</strong> · {a.entidad} · {a.registro_id ?? '—'}</p>
              <p className="text-xs text-stone-500">{a.actor_email ?? '—'} · {fechaHora(a.created_at)}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Anterior</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-stone-100 p-3 text-[11px] text-stone-800">{JSON.stringify(a.anteriores ?? null, null, 2)}</pre>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Nuevo</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-stone-100 p-3 text-[11px] text-stone-800">{JSON.stringify(a.nuevos ?? null, null, 2)}</pre>
                </div>
              </div>
            </div>
          );
        }
        if (lista.length === 0) {
          return <div className="mt-3"><Vacio texto="Sin movimientos auditados." /></div>;
        }
        return (
          <ul className="mt-3 space-y-2">
            {lista.map((a) => (
              <li key={a.id}>
                <button onClick={() => setDetalleId(a.id)} className="w-full rounded-lg border border-stone-200 bg-white p-3 text-left text-sm hover:border-[#d6bd7a]">
                  <p className="text-stone-900"><strong>{a.accion}</strong> · {a.entidad} · {a.registro_id ?? '—'}</p>
                  <p className="text-xs text-stone-500">{a.actor_email ?? '—'} · {fechaHora(a.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        );
      })()}
    </div>
  );
}

/* ==================== CORREOS ==================== */

export function Correos({ ctx }: { ctx: Ctx }) {
  const { m } = ctx;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Automatización <strong>preparada pero NO activada</strong>: falta proveedor y credenciales. No se envió nada automáticamente. Plantillas editables en Contenidos.
      </div>
      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Próximos recordatorios calculados ({m.candidatosRecordatorio.length})</h3>
        <p className="text-xs text-stone-500">Candidatos reales (confirmado + pago pendiente + importe &gt; 0). Fecha = último envío + cada {ctx.ajustes.recordatorio_cada_dias} días.</p>
        {m.candidatosRecordatorio.length === 0 ? (
          <div className="mt-2"><Vacio texto="Sin candidatos (sin confirmados con pago pendiente o sin datos)." /></div>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {m.candidatosRecordatorio.slice(0, 15).map((c) => (
              <li key={c.guestId} className="rounded-lg border border-stone-200 bg-white p-2">
                {c.nombre} · {formatoARS(c.importe)} · último: {c.ultimoEnvio ?? 'nunca'} · próximo: {c.proximaFecha ?? 'ya / sin fecha base'}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Plantillas</h3>
        {ctx.templates.map((t) => (
          <details key={t.id as string} className="mt-2 rounded-xl border border-stone-200 bg-white p-4">
            <summary className="cursor-pointer text-stone-900">{t.clave as string} · {t.asunto as string}</summary>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{t.cuerpo as string}</pre>
          </details>
        ))}
      </div>
      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Últimos envíos ({ctx.logs.length})</h3>
        {ctx.logs.length === 0 ? (
          <div className="mt-2"><Vacio texto="Sin envíos registrados." /></div>
        ) : (
          ctx.logs.slice(0, 30).map((l) => (
            <p key={l.id} className="mt-1 text-sm text-stone-700">
              [{l.tipo}] {l.destinatario} → <strong>{l.estado}</strong>
              {l.error ? ` · ${l.error}` : ''} · {fechaHora(l.enviado_at ?? l.created_at)}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/* ==================== FAMILIAS (existente, con agregados) ==================== */

export function Familias({ guests, groups, members, actor, recargar, resumenGrupos }: {
  guests: Guest[];
  groups: GrupoRow[];
  members: MiembroRow[];
  actor: string | null;
  recargar: () => Promise<void>;
  resumenGrupos: Metricas['gruposAgg'];
}) {
  const [nombre, setNombre] = useState('');
  const [nota, setNota] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<Array<{ apellido: string; ids: string[] }>>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  const generarSugerencias = () => {
    const mapa = new Map<string, string[]>();
    for (const g of guests) {
      const key = (g.apellido_familiar || g.nombre_apellido.split(' ').slice(-1)[0] || '').trim().toLowerCase();
      if (key.length < 2) continue;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(g.id);
    }
    setSugerencias(
      [...mapa.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([apellido, ids]) => ({ apellido, ids }))
        .slice(0, 50),
    );
  };

  const crearGrupo = async (nombreGrupo: string, ids: string[], manual = true) => {
    const { data, error } = await supabase.from('guest_groups').insert({ nombre: nombreGrupo, manual }).select('id').single();
    if (error || !data) {
      setNota(`No se pudo crear: ${error?.message ?? 'error'}`);
      return;
    }
    const gid = (data as { id: string }).id;
    if (ids.length > 0) {
      const { error: e2 } = await supabase.from('group_members').insert(ids.map((guest_id, i) => ({ group_id: gid, guest_id, orden: i })));
      if (e2) setNota(`Grupo creado pero fallaron miembros: ${e2.message}`);
    }
    const aviso = await auditar(actor, 'guest_groups', gid, 'crear', null, { nombre: nombreGrupo, miembros: ids.length });
    if (aviso) setNota(aviso);
    await recargar();
  };

  const renombrar = async (id: string, actual: string) => {
    const nuevo = window.prompt('Nuevo nombre del grupo:', actual);
    if (!nuevo || !nuevo.trim() || nuevo.trim() === actual) return;
    const { error } = await supabase.from('guest_groups').update({ nombre: nuevo.trim() }).eq('id', id);
    if (error) {
      setNota(`No se pudo renombrar: ${error.message}`);
      return;
    }
    await auditar(actor, 'guest_groups', id, 'renombrar', { nombre: actual }, { nombre: nuevo.trim() });
    await recargar();
  };

  const eliminarGrupo = async (id: string, nombreGrupo: string) => {
    if (!window.confirm(`Eliminar el grupo «${nombreGrupo}»? Los invitados no se borran, solo la agrupación.`)) return;
    const { error } = await supabase.from('guest_groups').delete().eq('id', id);
    if (error) {
      setNota(`No se pudo eliminar: ${error.message}`);
      return;
    }
    await auditar(actor, 'guest_groups', id, 'eliminar', { nombre: nombreGrupo }, null);
    await recargar();
  };

  const quitarMiembro = async (mid: string, m: MiembroRow) => {
    const { error } = await supabase.from('group_members').delete().eq('id', mid);
    if (error) {
      setNota(`No se pudo quitar: ${error.message}`);
      return;
    }
    await auditar(actor, 'group_members', mid, 'quitar', m, null);
    await recargar();
  };

  return (
    <div className="mt-2 space-y-4">
      {nota && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {nota} <button className="underline" onClick={() => setNota(null)}>Ocultar</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del grupo…" aria-label="Nombre del grupo" className="min-w-52 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
        <button onClick={() => nombre.trim() && crearGrupo(nombre.trim(), [])} className="rounded-full bg-[#183b2d] px-5 py-2 text-xs font-medium text-white">CREAR GRUPO</button>
        <button onClick={generarSugerencias} className="rounded-full border border-[#68785b] px-5 py-2 text-xs font-medium text-[#183b2d]">GENERAR SUGERENCIAS</button>
      </div>
      <p className="text-xs text-stone-500">
        Las sugerencias agrupan por apellido declarado para revisión manual: aceptar o corregir, nunca se asume parentesco. Lo manual no se sobrescribe. Un invitado en 2 grupos figura en ambos (ver nota en agregados).
      </p>
      {sugerencias.map((s) => (
        <div key={s.apellido} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-800">«{s.apellido}» · {s.ids.length} invitado(s) con ese apellido declarado</p>
          <button onClick={() => crearGrupo(`Familia ${s.apellido}`, s.ids, false)} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs">ACEPTAR SUGERENCIA</button>
        </div>
      ))}
      {groups.length === 0 && <Vacio texto="Sin grupos creados." />}
      {groups.map((gr) => {
        const mids = members.filter((m) => m.group_id === gr.id);
        const agg = resumenGrupos.find((a) => a.grupoId === gr.id);
        const abierto = expandido === gr.id;
        return (
          <div key={gr.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <button
              onClick={() => setExpandido(abierto ? null : (gr.id as string))}
              aria-expanded={abierto}
              className="w-full cursor-pointer text-left font-medium text-stone-900"
            >
              {gr.nombre} · {mids.length} miembro(s) {gr.manual === false ? '(sugerencia aceptada)' : ''}
            </button>
            {abierto && (
              <div className="mt-2">
                <Volver onVolver={() => setExpandido(null)} destino="la lista de grupos" />
              </div>
            )}
            {abierto && (
              <>
                {agg && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div><dt className="text-stone-500">Confirmados</dt><dd className="font-medium tabular-nums">{agg.confirmados} reg. · {agg.personas} pers.</dd></div>
                    <div><dt className="text-stone-500">Que abonan</dt><dd className="font-medium tabular-nums">{agg.pagan} pers.</dd></div>
                    <div><dt className="text-stone-500">Esperado / verificado</dt><dd className="font-medium tabular-nums">{formatoARS(agg.esperado)} / {formatoARS(agg.verificado)}</dd></div>
                    <div><dt className="text-stone-500">Saldo</dt><dd className="font-medium tabular-nums">{formatoARS(agg.saldo)}</dd></div>
                  </dl>
                )}
                <div className="mt-2 flex gap-3">
                  <button onClick={() => renombrar(gr.id, gr.nombre)} className="text-xs text-[#0e5c42] underline underline-offset-2">Renombrar</button>
                  <button onClick={() => eliminarGrupo(gr.id, gr.nombre)} className="text-xs text-red-800 underline underline-offset-2">Eliminar grupo</button>
                </div>
                <div className="mt-2 space-y-1">
                  {mids.map((m) => {
                    const g = guests.find((x) => x.id === m.guest_id);
                    return (
                      <p key={(m.id as string) ?? `${m.group_id}-${m.guest_id}`} className="flex justify-between gap-2 text-sm text-stone-800">
                        <span>{g?.nombre_apellido ?? (m.guest_id as string)} <span className="text-xs text-stone-500">({m.rol === 'titular' ? 'contacto titular' : 'miembro'})</span></span>
                        <button onClick={() => quitarMiembro(m.id as string, m)} className="text-xs text-red-800 underline">quitar</button>
                      </p>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Nueva sección de contenido (p. ej. fotos_titulo/fotos_texto) ---------- */
function NuevaSeccion({
  actor,
  recargar,
  onMsg,
}: {
  actor: string | null;
  recargar: () => Promise<void>;
  onMsg: (m: string | null) => void;
}) {
  const [clave, setClave] = useState('');
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const crear = async () => {
    const k = clave.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(k)) {
      onMsg('Clave inválida: minúsculas, números y guiones bajos (ej. fotos_titulo).');
      return;
    }
    if (k.startsWith('diseno_')) {
      onMsg('Las claves diseno_* se gestionan en “Diseño e imágenes”.');
      return;
    }
    const { data, error } = await supabase
      .from('content_sections')
      .insert({ clave: k, titulo: titulo.trim() || k, cuerpo, visible: true, orden: 200 })
      .select('id')
      .single();
    if (error) {
      onMsg(error.code === '23505' ? `Ya existe una sección «${k}»: editala abajo.` : `No se pudo crear: ${error.message}`);
      return;
    }
    await auditar(actor, 'content_sections', (data as { id: string }).id, 'crear', null, { clave: k });
    setClave('');
    setTitulo('');
    setCuerpo('');
    onMsg(`Sección «${k}» creada.`);
    await recargar();
  };
  return (
    <details className="mt-2 rounded-xl border border-stone-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-stone-900">+ Nueva sección de texto</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="clave (ej. fotos_titulo)"
          aria-label="Clave de la sección" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título visible"
          aria-label="Título de la sección" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Texto"
          aria-label="Texto de la sección" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <button onClick={crear} className="mt-2 rounded-full bg-[#183b2d] px-4 py-1.5 text-xs font-medium text-white">
        Crear sección
      </button>
    </details>
  );
}

/* ---------- Contenidos / editor (existente) ---------- */
export function Contenidos({ settings, sections, templates, versions, actor, recargar }: {
  settings: R | null;
  sections: R[];
  templates: R[];
  versions: R[];
  actor: string | null;
  recargar: () => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) f[k] = String(v ?? '');
      setForm(f);
    }
  }, [settings]);

  const guardarEvento = async () => {
    if (!settings) return;
    await supabase.from('configuration_versions').insert({
      nombre: `respaldo-${new Date().toISOString().slice(0, 19)}`,
      descripcion: 'Respaldo automático antes de publicar cambios',
      datos: settings,
      creado_por: actor,
    });
    const patch: Record<string, unknown> = { ...form };
    delete patch.id;
    delete patch.created_at;
    delete patch.updated_at;
    for (const k of ['precio_tarjeta', 'edad_minima_paga', 'recordatorio_cada_dias']) {
      if (patch[k] !== undefined) patch[k] = Number(patch[k]);
    }
    if (typeof patch.recordatorios_activos === 'string') {
      patch.recordatorios_activos = patch.recordatorios_activos === 'true';
    }
    const { error } = await supabase.from('event_settings').update(patch).eq('id', settings.id as string);
    if (!error) {
      const aviso = await auditar(actor, 'event_settings', settings.id as string, 'publicar', settings, patch);
      setMsg(aviso ?? 'Publicado. Se guardó un respaldo recuperable.');
      await recargar();
    } else {
      setMsg(`No se pudo guardar: ${error.message}`);
    }
    setTimeout(() => setMsg(null), 5000);
  };

  const restaurar = async (id: string) => {
    const { data, error } = await supabase.from('configuration_versions').select('datos').eq('id', id).single();
    if (error || !data) {
      setMsg(`No se pudo leer la versión: ${error?.message ?? 'error'}`);
      return;
    }
    const datos = (data as { datos?: Record<string, unknown> }).datos;
    if (!datos || !settings) return;
    const patch = { ...datos };
    delete patch.id;
    delete patch.created_at;
    delete patch.updated_at;
    const { error: e2 } = await supabase.from('event_settings').update(patch).eq('id', settings.id as string);
    if (e2) {
      setMsg(`No se pudo restaurar: ${e2.message}`);
      return;
    }
    await auditar(actor, 'event_settings', settings.id as string, 'restaurar-version', settings, patch);
    setMsg('Versión recuperada.');
    await recargar();
  };

  const CAMPOS: Array<[string, string]> = [
    ['quinceanera', 'Quinceañera'], ['evento', 'Evento'], ['fecha', 'Fecha'],
    ['hora_inicio', 'Hora inicio'], ['hora_fin', 'Hora fin'], ['fecha_fin', 'Fecha fin'],
    ['zona_horaria', 'Zona horaria'], ['salon', 'Salón'], ['direccion', 'Dirección'],
    ['vestimenta', 'Vestimenta'], ['fecha_limite_confirmacion', 'Límite confirmación'],
    ['fecha_limite_pago', 'Límite pago'], ['precio_tarjeta', 'Precio tarjeta'],
    ['edad_minima_paga', 'Edad mínima que paga'], ['whatsapp_comprobantes', 'WhatsApp comprobantes'],
    ['alias_transferencia', 'Alias'], ['titular_transferencia', 'Titular'],
    ['mensaje_final', 'Mensaje final'], ['recordatorio_cada_dias', 'Recordatorio cada (días)'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Evento</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CAMPOS.map(([k, etiqueta]) => (
            <label key={k} className="block">
              <span className="text-xs uppercase tracking-[0.15em] text-stone-500">{etiqueta}</span>
              <input
                value={form[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs uppercase tracking-[0.15em] text-stone-500">Recordatorios activos</span>
            <select
              value={form.recordatorios_activos ?? 'true'}
              onChange={(e) => setForm((f) => ({ ...f, recordatorios_activos: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="true">Activados</option>
              <option value="false">Pausados</option>
            </select>
          </label>
        </div>
        <button onClick={guardarEvento} className="mt-4 rounded-full bg-[#183b2d] px-6 py-3 text-xs font-medium text-white">
          GUARDAR Y PUBLICAR
        </button>
        {msg && <p className="mt-2 text-sm text-stone-700">{msg}</p>}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Textos de la invitación</h3>
        <p className="text-xs text-stone-500">Las imágenes de diseño (<code>diseno_*</code>) se administran en “Diseño e imágenes”, no aquí.</p>
        <NuevaSeccion actor={actor} recargar={recargar} onMsg={setMsg} />
        {sections.filter((s) => !(s.clave as string).startsWith('diseno_')).map((s) => (
          <details key={s.id as string} className="mt-2 rounded-xl border border-stone-200 bg-white p-4">
            <summary className="cursor-pointer text-stone-900">{s.clave as string}</summary>
            <textarea
              defaultValue={(s.cuerpo as string) ?? ''}
              rows={3}
              id={`sec-${s.id as string}`}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={async () => {
                const el = document.getElementById(`sec-${s.id as string}`) as HTMLTextAreaElement;
                const { error } = await supabase.from('content_sections').update({ cuerpo: el.value }).eq('id', s.id as string);
                if (error) {
                  setMsg(`No se pudo guardar: ${error.message}`);
                  return;
                }
                await auditar(actor, 'content_sections', s.id as string, 'editar-texto', s, { cuerpo: el.value });
                setMsg('Texto guardado.');
                await recargar();
              }}
              className="mt-2 rounded-full border border-stone-300 px-4 py-1.5 text-xs"
            >
              GUARDAR TEXTO
            </button>
          </details>
        ))}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Plantillas de correo</h3>
        {templates.map((t) => (
          <details key={t.id as string} className="mt-2 rounded-xl border border-stone-200 bg-white p-4">
            <summary className="cursor-pointer text-stone-900">{t.clave as string}</summary>
            <input
              defaultValue={t.asunto as string}
              id={`ta-${t.id as string}`}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              aria-label="Asunto"
            />
            <textarea
              defaultValue={t.cuerpo as string}
              rows={5}
              id={`tc-${t.id as string}`}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              aria-label="Cuerpo"
            />
            <button
              onClick={async () => {
                const a = (document.getElementById(`ta-${t.id as string}`) as HTMLInputElement).value;
                const c = (document.getElementById(`tc-${t.id as string}`) as HTMLTextAreaElement).value;
                const { error } = await supabase.from('email_templates').update({ asunto: a, cuerpo: c }).eq('id', t.id as string);
                if (error) {
                  setMsg(`No se pudo guardar: ${error.message}`);
                  return;
                }
                await auditar(actor, 'email_templates', t.id as string, 'editar-plantilla', t, { asunto: a });
                setMsg('Plantilla guardada.');
                await recargar();
              }}
              className="mt-2 rounded-full border border-stone-300 px-4 py-1.5 text-xs"
            >
              GUARDAR PLANTILLA
            </button>
          </details>
        ))}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#183b2d]">Versiones recuperables</h3>
        {versions.length === 0 && <p className="text-xs text-stone-500">Sin respaldos.</p>}
        {versions.filter((v) => !(v.nombre as string).startsWith('diseno-')).map((v) => (
          <p key={v.id as string} className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <span>{v.nombre as string} · {fechaHora(v.created_at as string)}</span>
            <button onClick={() => restaurar(v.id as string)} className="text-xs text-[#0e5c42] underline underline-offset-2">
              Recuperar esta versión
            </button>
          </p>
        ))}
      </div>
    </div>
  );
}

/* ---------- Galería admin (existente) ---------- */
export function GaleriaAdmin({ images, actor, recargar }: {
  images: R[];
  actor: string | null;
  recargar: () => Promise<void>;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [epigrafe, setEpigrafe] = useState('');

  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    try {
      for (const f of Array.from(files)) {
        const path = `${Date.now()}-${f.name.replaceAll(' ', '-')}`;
        const { error } = await supabase.storage.from('galeria').upload(path, f, { upsert: false });
        if (error) {
          setNota(`No se pudo subir ${f.name}: ${error.message}`);
          continue;
        }
        const { data } = supabase.storage.from('galeria').getPublicUrl(path);
        const maxOrden = images.reduce((a, i) => Math.max(a, Number(i.orden ?? 0)), 0);
        const { error: e2 } = await supabase.from('gallery_images').insert({
          storage_path: path,
          url_publica: data.publicUrl,
          orden: maxOrden + 1,
        });
        if (e2) setNota(`Subida OK pero falló el registro: ${e2.message}`);
      }
      await auditar(actor, 'gallery_images', null, 'subir', null, { cantidad: files.length });
      await recargar();
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div>
      {nota && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {nota} <button className="underline" onClick={() => setNota(null)}>Ocultar</button>
        </div>
      )}
      <label className="inline-block cursor-pointer rounded-full bg-[#183b2d] px-6 py-3 text-xs font-medium text-white">
        {subiendo ? 'SUBIENDO…' : 'SUBIR FOTOS'}
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
      </label>
      {(() => {
        const sel = detalleId ? images.find((x) => x.id === detalleId) ?? null : null;
        if (sel) {
          const img = sel;
          return (
            <div className="mt-4 rounded-xl border border-[#d6bd7a]/50 bg-[#fffdf7] p-5" role="dialog" aria-label="Detalle de la imagen">
              <Volver onVolver={() => setDetalleId(null)} destino="la galería" />
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {img.url_publica ? (
                  <img src={img.url_publica as string} alt={(img.epigrafe as string) || 'Foto'} className="aspect-[3/4] w-full rounded-lg object-cover" />
                ) : (
                  <div className="aspect-[3/4] rounded-lg bg-stone-100" />
                )}
                <div className="text-sm">
                  <dl className="space-y-1">
                    <div><dt className="text-stone-500">Archivo</dt><dd className="font-mono text-[11px]">{img.storage_path as string}</dd></div>
                    <div><dt className="text-stone-500">Orden</dt><dd className="tabular-nums">{String(img.orden ?? 0)}</dd></div>
                  </dl>
                  <label className="mt-3 block">
                    <span className="text-xs uppercase tracking-[0.15em] text-stone-500">Epígrafe</span>
                    <input
                      value={epigrafe}
                      onChange={(e) => setEpigrafe(e.target.value)}
                      placeholder={(img.epigrafe as string) || 'Sin epígrafe'}
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        const { error } = await supabase.from('gallery_images').update({ epigrafe: epigrafe || null }).eq('id', img.id as string);
                        if (error) {
                          setNota(`No se pudo guardar: ${error.message}`);
                          return;
                        }
                        await auditar(actor, 'gallery_images', img.id as string, 'editar-epigrafe', img, { epigrafe });
                        setNota('Epígrafe guardado.');
                        await recargar();
                      }}
                      className="rounded-full bg-[#183b2d] px-4 py-2 text-xs font-medium text-white"
                    >
                      Guardar epígrafe
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm('Eliminar esta foto de la galería?')) return;
                        const { error } = await supabase.storage.from('galeria').remove([img.storage_path as string]);
                        if (error) {
                          setNota(`No se pudo borrar el archivo: ${error.message}`);
                          return;
                        }
                        await supabase.from('gallery_images').delete().eq('id', img.id as string);
                        await auditar(actor, 'gallery_images', img.id as string, 'eliminar', img, null);
                        setDetalleId(null);
                        await recargar();
                      }}
                      className="rounded-full border border-red-300 px-4 py-2 text-xs font-medium text-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        if (images.length === 0) {
          return <div className="mt-3"><Vacio texto="Sin fotografías cargadas." /></div>;
        }
        return (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              <button
                key={img.id as string}
                onClick={() => { setDetalleId(img.id as string); setEpigrafe((img.epigrafe as string) ?? ''); }}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left hover:border-[#d6bd7a]"
                aria-label={`Abrir detalle de foto ${(img.epigrafe as string) || ''}`}
              >
                {img.url_publica ? (
                  <img src={img.url_publica as string} alt={(img.epigrafe as string) || 'Foto'} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="aspect-[3/4] bg-stone-100" />
                )}
                <p className="truncate p-2 text-xs text-stone-600">{(img.epigrafe as string) || 'Sin epígrafe'}</p>
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

/* ==================== DISEÑO E IMÁGENES ==================== */

interface HistorialDiseno {
  id: string;
  created_at: string;
  datos: { clave?: string; anterior_url?: string | null; nueva_url?: string; pos?: string };
}

function TarjetaDiseno({ ctx, def }: { ctx: Ctx; def: FondoDef }) {
  const mapa = mapaDiseno(
    ctx.sections.map((s) => ({
      clave: s.clave as string,
      cuerpo: s.cuerpo as string | null,
      updated_at: s.updated_at as string | undefined,
    })),
  );
  const actual = resolverFondo(mapa, def.clave);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [pos, setPos] = useState(actual.pos);
  const [confirmado, setConfirmado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<HistorialDiseno[] | null>(null);

  const elegir = (files: FileList | null) => {
    const f = files?.[0] ?? null;
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    if (!f) {
      setArchivo(null);
      setVistaPrevia(null);
      return;
    }
    if (!f.type.startsWith('image/')) {
      setMsg(`Archivo rechazado: ${f.name} no es una imagen.`);
      setArchivo(null);
      setVistaPrevia(null);
      return;
    }
    if (f.size > MAX_BYTES_IMAGEN) {
      setMsg(`Archivo rechazado: supera los 5 MB (${(f.size / 1048576).toFixed(1)} MB).`);
      setArchivo(null);
      setVistaPrevia(null);
      return;
    }
    setMsg(null);
    setArchivo(f);
    setVistaPrevia(URL.createObjectURL(f));
    setConfirmado(false);
  };

  const cancelar = () => {
    if (vistaPrevia && !window.confirm('Descartar la vista previa sin guardar?')) return;
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    setArchivo(null);
    setVistaPrevia(null);
    setConfirmado(false);
    setMsg(null);
  };

  const guardar = async () => {
    if (!archivo || !vistaPrevia) return;
    setGuardando(true);
    setMsg(null);
    try {
      const ruta = nombreSeguro(def.clave, archivo.name);
      const { error: upErr } = await supabase.storage.from('galeria').upload(ruta, archivo, {
        upsert: false,
        contentType: archivo.type,
      });
      if (upErr) throw new Error(`No se pudo subir: ${upErr.message}`);
      const { data: pub } = supabase.storage.from('galeria').getPublicUrl(ruta);

      const anterior = actual.personalizado ? actual.src : null;
      const fila = ctx.sections.find((s) => s.clave === def.clave);
      const filaPos = ctx.sections.find((s) => s.clave === `${def.clave}_pos`);
      if (fila) {
        const { error } = await supabase.from('content_sections').update({ cuerpo: pub.publicUrl }).eq('id', fila.id as string);
        if (error) throw new Error(`Subida OK pero no se guardó la referencia: ${error.message}`);
      } else {
        const { error } = await supabase
          .from('content_sections')
          .insert({ clave: def.clave, titulo: def.seccion, cuerpo: pub.publicUrl, visible: true, orden: 100 });
        if (error) throw new Error(`Subida OK pero no se creó la referencia: ${error.message}`);
      }
      if (filaPos) {
        await supabase.from('content_sections').update({ cuerpo: pos }).eq('id', filaPos.id as string);
      } else {
        await supabase.from('content_sections').insert({ clave: `${def.clave}_pos`, titulo: `${def.seccion} (encuadre)`, cuerpo: pos, visible: false, orden: 101 });
      }

      await supabase.from('configuration_versions').insert({
        nombre: `diseno-${def.clave}-${new Date().toISOString().slice(0, 19)}`,
        descripcion: `Respaldo de imagen anterior (${def.seccion})`,
        datos: { clave: def.clave, anterior_url: anterior, nueva_url: pub.publicUrl, pos },
        creado_por: ctx.actor,
      });
      await auditar(ctx.actor, 'content_sections', def.clave, 'cambiar-imagen', { url: anterior }, { url: pub.publicUrl, pos });

      // Limpieza segura del archivo anterior: solo si vive en diseno/,
      // difiere del nuevo y ninguna otra clave lo referencia.
      if (anterior) {
        const anteriorPath = pathDesdeUrl(anterior);
        const nuevoPath = pathDesdeUrl(pub.publicUrl);
        const enUso = ctx.sections.some(
          (s) => s.clave !== def.clave && (s.cuerpo as string) === anterior,
        );
        if (anteriorPath && anteriorPath.startsWith('diseno/') && anteriorPath !== nuevoPath && !enUso) {
          await supabase.storage.from('galeria').remove([anteriorPath]);
        }
      }

      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
      setArchivo(null);
      setVistaPrevia(null);
      setConfirmado(false);
      setHistorial(null);
      setMsg('Guardado. La invitación ya muestra la imagen nueva.');
      await ctx.recargar();
    } catch (e) {
      // La imagen anterior sigue vigente: no se tocó su referencia.
      setMsg(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const verHistorial = async () => {
    const { data, error } = await supabase
      .from('configuration_versions')
      .select('id,created_at,datos')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      setMsg(`No se pudo leer el historial: ${error.message}`);
      return;
    }
    setHistorial(
      ((data as Array<{ id: string; created_at: string; datos: HistorialDiseno['datos'] }>) ?? []).filter(
        (v) => v.datos?.clave === def.clave,
      ) as HistorialDiseno[],
    );
  };

  const restaurar = async (h: HistorialDiseno) => {
    if (!h.datos.anterior_url) return;
    const fila = ctx.sections.find((s) => s.clave === def.clave);
    if (!fila) {
      setMsg('No hay fila para restaurar.');
      return;
    }
    const { error } = await supabase
      .from('content_sections')
      .update({ cuerpo: h.datos.anterior_url })
      .eq('id', fila.id as string);
    if (error) {
      setMsg(`No se pudo restaurar: ${error.message}`);
      return;
    }
    await auditar(ctx.actor, 'content_sections', def.clave, 'restaurar-imagen', { url: actual.src }, { url: h.datos.anterior_url });
    setMsg('Imagen anterior restaurada.');
    await ctx.recargar();
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="font-medium text-stone-900">{def.seccion}</h3>
      <p className="text-xs text-stone-500">
        Actual: {actual.personalizado ? `personalizada${actual.actualizada ? ` (${fechaHora(actual.actualizada)})` : ''}` : 'imagen original del diseño'}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Actual</p>
          <img
            src={actual.src}
            alt={`Imagen actual de ${def.seccion}`}
            loading="lazy"
            decoding="async"
            className={def.clave === 'diseno_figura' ? 'mt-1 aspect-[2/3] w-full rounded-lg object-cover' : 'mt-1 aspect-video w-full rounded-lg object-cover'}
            style={{ objectPosition: actual.pos }}
          />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Vista previa</p>
          {vistaPrevia ? (
            <div className="relative mt-1 overflow-hidden rounded-lg border border-[#d6bd7a]/60">
              <img
                src={vistaPrevia}
                alt="Vista previa de la imagen nueva"
                className={def.clave === 'diseno_figura' ? 'aspect-[2/3] w-full object-cover' : 'aspect-video w-full object-cover'}
                style={{ objectPosition: pos }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e241b]/70 via-transparent to-[#0e241b]/30" />
              {def.clave !== 'diseno_figura' && (
                <p className="font-caligrafica pointer-events-none absolute inset-x-0 bottom-2 text-center text-4xl text-[#ecdcb0]">
                  Antonella
                </p>
              )}
            </div>
          ) : (
            <div className="mt-1 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs text-stone-500">
              Elegí un archivo para previsualizar. Nada se publica hasta guardar.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full bg-[#183b2d] px-4 py-2 text-xs font-medium text-white">
          ELEGIR IMAGEN
          <input type="file" accept="image/*" className="hidden" onChange={(e) => elegir(e.target.files)} />
        </label>
        <label className="text-xs text-stone-600" htmlFor={`pos-${def.clave}`}>
          Encuadre
        </label>
        <select
          id={`pos-${def.clave}`}
          value={ENCUADRES.some((e) => e.css === pos) ? pos : 'center'}
          onChange={(e) => setPos(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-xs"
        >
          {ENCUADRES.map((e) => (
            <option key={e.id} value={e.css}>{e.etiqueta}</option>
          ))}
        </select>
        {vistaPrevia && (
          <>
            <button
              onClick={guardar}
              disabled={!confirmado || guardando}
              className="rounded-full bg-[#b89b52] px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {guardando ? 'GUARDANDO…' : 'GUARDAR Y PUBLICAR'}
            </button>
            <button onClick={cancelar} className="rounded-full border border-stone-300 px-4 py-2 text-xs">
              Cancelar (conserva la vigente)
            </button>
          </>
        )}
        <button onClick={verHistorial} className="text-xs text-[#0e5c42] underline underline-offset-2">
          Ver historial y restauraciones
        </button>
      </div>

      {vistaPrevia && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {def.permitePersona
              ? 'Confirmo que verifiqué visualmente la imagen: muestra UNA sola persona de espaldas, sin rostro ni acompañantes.'
              : 'Confirmo que verifiqué visualmente la imagen: NO contiene personas, rostros, siluetas ni reflejos humanos. Ningún filtro automático lo garantiza.'}
          </span>
        </label>
      )}
      {msg && <p className="mt-2 text-xs text-stone-700" role="status">{msg}</p>}

      {historial && (
        <div className="mt-3 border-t border-stone-200 pt-2">
          <p className="text-xs font-medium text-stone-600">Historial (versiones conservadas)</p>
          {historial.length === 0 && <p className="text-xs text-stone-500">Sin versiones anteriores.</p>}
          {historial.map((h) => (
            <div key={h.id} className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-stone-600">{fechaHora(h.created_at)}</span>
              {h.datos.anterior_url ? (
                <button onClick={() => restaurar(h)} className="text-[#0e5c42] underline underline-offset-2">
                  Restaurar esta versión anterior
                </button>
              ) : (
                <span className="text-stone-400">Era la imagen original (sin anterior).</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Diseno({ ctx }: { ctx: Ctx }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#d6bd7a]/50 bg-[#fffdf7] p-4 text-sm text-stone-700">
        <p className="font-medium text-stone-900">Diseño e imágenes de la invitación</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          Cada tarjeta gestiona una imagen con clave propia: cambiar una no altera las demás
          (portada, pagos y cierre comparten el archivo original pero tienen referencias
          independientes y se separan sin riesgo). Los archivos se guardan en Storage
          (carpeta <code>diseno/</code>, separada de la galería) y las referencias en la
          configuración: <strong>persisten ante recargas y reinicios</strong>. La galería
          del evento se administra aparte, en su sección.
        </p>
      </div>
      {FONDOS.map((def) => (
        <TarjetaDiseno key={def.clave} ctx={ctx} def={def} />
      ))}
    </div>
  );
}
