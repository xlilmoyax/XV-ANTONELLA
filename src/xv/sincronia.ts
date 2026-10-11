/**
 * XV-ANTONELLA · Lógica pura de sincronización del asistente (sin I/O).
 *
 * Principios:
 * - Los ids remotos y de mensajes los genera el CLIENTE (UUID v4): los
 *   reintentos reutilizan los mismos ids + upsert con ignoreDuplicates, así
 *   un fallo parcial nunca duplica al reintentar.
 * - El historial local heredado (ids no-UUID) se migra UNA vez con ids
 *   nuevos; el mapa localId→remoteId impide re-subidas.
 * - Fusión sin pérdidas: unión por id, sin borrar nada en ningún lado.
 * - Orden total: (created_at, id) — desempata mensajes del mismo ms.
 * - El cliente NUNCA envía `owner`: la columna usa DEFAULT auth.uid() y la
 *   RLS lo verifica. Probar con grep: ningún payload de inserción incluye owner.
 */

import type { Conversacion, Mensaje } from './conversacion';

export interface EntradaRemota {
  id: string;
  titulo: string;
  actualizada: string;
  mensajes: Mensaje[];
}

/** Orden cronológico total y determinista. */
export function ordenarMensajes(ms: Mensaje[]): Mensaje[] {
  return [...ms].sort((a, b) =>
    a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

export function ordenarChats(cs: Conversacion[]): Conversacion[] {
  return [...cs].sort((a, b) =>
    a.actualizada < b.actualizada ? 1 : a.actualizada > b.actualizada ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

export interface MapaSync {
  [localId: string]: { remoteId: string; syncedMsgIds: string[] };
}

/**
 * Fusiona historial local con snapshot remoto.
 * - Remoto manda en contenido ante mismo id (fuente compartida).
 * - Local no mapeado se conserva tal cual (nunca se pierde).
 * - No duplica: cada id aparece una vez.
 */
export function fusionarConversaciones(
  locales: Conversacion[],
  remotas: EntradaRemota[],
  mapa: MapaSync,
): Conversacion[] {
  const remotoPorId = new Map(remotas.map((r) => [r.id, r]));
  const localIdPorRemoto = new Map<string, string>();
  for (const [localId, m] of Object.entries(mapa)) localIdPorRemoto.set(m.remoteId, localId);

  const salida: Conversacion[] = [];
  const consumidosLocales = new Set<string>();

  for (const r of remotas) {
    const localId = localIdPorRemoto.get(r.id);
    const local = localId ? locales.find((c) => c.id === localId) : undefined;
    if (local) consumidosLocales.add(local.id);
    // Mensajes: unión por id (remoto + locales no sincronizados aún).
    const vistos = new Set<string>();
    const msgs: Mensaje[] = [];
    for (const msg of [...r.mensajes, ...(local ? local.mensajes : [])]) {
      if (vistos.has(msg.id)) continue;
      vistos.add(msg.id);
      msgs.push(msg);
    }
    salida.push({
      id: local?.id ?? r.id,
      titulo: r.titulo,
      mensajes: ordenarMensajes(msgs),
      actualizada: r.actualizada > (local?.actualizada ?? '') ? r.actualizada : (local?.actualizada ?? r.actualizada),
    });
  }
  for (const c of locales) {
    if (!consumidosLocales.has(c.id) && !remotoPorId.has(c.id)) {
      salida.push({ ...c, mensajes: ordenarMensajes(c.mensajes) });
    }
  }
  return ordenarChats(salida);
}

/* Nota: fusionarConversaciones ya ordena mensajes (created_at, id) y chats
   (actualizada desc); ningún llamador debe reordenar por su cuenta. */

/** Chats locales aún no migrados (sin entrada en el mapa). */
export function pendientesDeMigrar(locales: Conversacion[], mapa: MapaSync): Conversacion[] {
  return locales.filter((c) => !mapa[c.id] && c.mensajes.length > 0);
}

/** Ids de mensajes locales todavía no sincronizados para un chat mapeado. */
export function mensajesFaltantes(chat: Conversacion, mapa: MapaSync): Mensaje[] {
  const m = mapa[chat.id];
  if (!m) return [...chat.mensajes];
  const sync = new Set(m.syncedMsgIds);
  return chat.mensajes.filter((x) => !sync.has(x.id));
}

/** Fila de conversación para insert remoto (SIN owner: lo pone DEFAULT auth.uid()). */
export function filaConversacionRemota(remoteId: string, titulo: string): { id: string; titulo: string } {
  return { id: remoteId, titulo: titulo.slice(0, 80) || 'Nueva conversación' };
}

/** Filas de mensajes para upsert idempotente (ids ya asignados por el llamador). */
export function filasMensajesRemotos(
  remoteId: string,
  mensajes: Array<{ id: string; rol: Mensaje['rol']; texto: string; ts: string; datos?: unknown }>,
): Array<Record<string, unknown>> {
  return mensajes.map((x) => ({
    id: x.id,
    conversation_id: remoteId,
    rol: x.rol,
    texto: x.texto.slice(0, 4000),
    datos: x.datos ?? null,
    created_at: x.ts,
  }));
}

const CLAVE_MAPA = (actor: string) => `xv-asistente-mapa:${actor}`;

export function cargarMapa(actor: string): { mapa: MapaSync; soloMemoria: boolean } {
  try {
    const raw = localStorage.getItem(CLAVE_MAPA(actor));
    if (!raw) return { mapa: {}, soloMemoria: false };
    const m = JSON.parse(raw) as MapaSync;
    if (typeof m !== 'object' || m === null) return { mapa: {}, soloMemoria: false };
    return { mapa: m, soloMemoria: false };
  } catch {
    return { mapa: {}, soloMemoria: true };
  }
}

export function guardarMapa(actor: string, mapa: MapaSync): boolean {
  try {
    localStorage.setItem(CLAVE_MAPA(actor), JSON.stringify(mapa));
    return true;
  } catch {
    return false;
  }
}
