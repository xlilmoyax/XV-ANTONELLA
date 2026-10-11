/**
 * XV-ANTONELLA · Acceso remoto al historial del asistente (requiere 0005).
 *
 * Reglas duras:
 * - NUNCA se envía `owner`: la columna tiene DEFAULT auth.uid() y la RLS lo
 *   verifica. Verificar con: grep -rn "owner" src/xv/chatStore.ts → solo tipos
 *   de lectura y comentarios, ningún payload de escritura.
 * - Sesión requerida: sin usuario autenticado no se intenta nada remoto.
 * - Reintentos idempotentes: ids UUID generados en cliente + upsert con
 *   ignoreDuplicates (un fallo parcial no duplica al reintentar).
 * - Ante error, lo local se conserva siempre; se informa, no se oculta.
 * - Sin 0005 aplicada, detectarModo() responde 'ausente' y todo lo demás
 *   queda inerte (la app sigue 100% local).
 */

import { supabase } from '../lib/supabaseClient';
import type { Mensaje } from './conversacion';
import {
  cargarMapa,
  filaConversacionRemota,
  filasMensajesRemotos,
  guardarMapa,
  mensajesFaltantes,
  pendientesDeMigrar,
  type EntradaRemota,
} from './sincronia';

export type ModoSync = 'remoto' | 'ausente' | 'error';

async function sesionEmail(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** ¿Existe el backend de chats? Solo lectura mínima. */
export async function detectarModo(): Promise<{ modo: ModoSync; detalle?: string }> {
  try {
    const { error } = await supabase.from('assistant_conversations').select('id', { head: true, count: 'exact' }).limit(1);
    if (!error) return { modo: 'remoto' };
    const msg = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/42P01|PGRST205|does not exist|schema cache/i.test(msg)) {
      return { modo: 'ausente', detalle: 'Migración 0005 no aplicada: historial solo local.' };
    }
    return { modo: 'error', detalle: msg.slice(0, 160) };
  } catch (e) {
    return { modo: 'error', detalle: e instanceof Error ? e.message.slice(0, 160) : 'error' };
  }
}

export async function listarRemoto(): Promise<{ ok: boolean; entradas: EntradaRemota[]; error?: string }> {
  const email = await sesionEmail();
  if (!email) return { ok: false, entradas: [], error: 'Sin sesión: iniciá sesión para sincronizar.' };
  const { data: convs, error: e1 } = await supabase
    .from('assistant_conversations')
    .select('id,titulo,updated_at')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (e1) return { ok: false, entradas: [], error: e1.message };
  const { data: msgs, error: e2 } = await supabase
    .from('assistant_messages')
    .select('id,conversation_id,rol,texto,datos,created_at')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2000);
  if (e2) return { ok: false, entradas: [], error: e2.message };
  const porConv = new Map<string, Mensaje[]>();
  const filasMsg = ((msgs ?? []) as Array<Record<string, unknown>>);
  for (const x of filasMsg) {
    const cid = x.conversation_id as string;
    if (!porConv.has(cid)) porConv.set(cid, []);
    const d = (x.datos ?? {}) as Record<string, unknown>;
    porConv.get(cid)!.push({
      id: x.id as string,
      rol: x.rol as Mensaje['rol'],
      texto: x.texto as string,
      ts: x.created_at as string,
      lineas: Array.isArray(d.lineas) ? (d.lineas as string[]) : undefined,
      metodo: typeof d.metodo === 'string' ? d.metodo : undefined,
      destino: (d.destino ?? undefined) as Mensaje['destino'],
      tema: typeof d.tema === 'string' ? d.tema : undefined,
    });
  }
  return {
    ok: true,
    entradas: ((convs ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      titulo: (c.titulo as string) ?? 'Conversación',
      actualizada: (c.updated_at as string) ?? '',
      mensajes: porConv.get(c.id as string) ?? [],
    })),
  };
}

function datosDe(m: Mensaje): Record<string, unknown> {
  return {
    lineas: m.lineas ?? null,
    metodo: m.metodo ?? null,
    destino: m.destino ?? null,
    tema: m.tema ?? null,
  };
}

/** Sube mensajes (upsert idempotente). Requiere sesión; nunca envía owner. */
export async function subirMensajes(
  remoteId: string,
  mensajes: Mensaje[],
): Promise<{ ok: boolean; error?: string }> {
  const email = await sesionEmail();
  if (!email) return { ok: false, error: 'Sin sesión.' };
  const filas = filasMensajesRemotos(
    remoteId,
    mensajes.map((x) => ({ id: x.id, rol: x.rol, texto: x.texto, ts: x.ts, datos: datosDe(x) })),
  );
  if (filas.length === 0) return { ok: true };
  const { error } = await supabase.from('assistant_messages').upsert(filas, {
    onConflict: 'id',
    ignoreDuplicates: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function crearConversacionRemota(remoteId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const email = await sesionEmail();
  if (!email) return { ok: false, error: 'Sin sesión.' };
  const { error } = await supabase.from('assistant_conversations').insert(filaConversacionRemota(remoteId, titulo));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renombrarRemoto(remoteId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('assistant_conversations').update({ titulo }).eq('id', remoteId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarRemoto(remoteId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('assistant_conversations').delete().eq('id', remoteId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { cargarMapa, guardarMapa, mensajesFaltantes, pendientesDeMigrar };
