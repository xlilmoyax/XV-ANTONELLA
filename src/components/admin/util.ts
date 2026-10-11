import { supabase } from '../../lib/supabaseClient';

/** Auditoría best-effort con aviso visible ante fallo (nunca silenciosa total). */
export async function auditar(
  actor: string | null,
  entidad: string,
  registro: string | null,
  accion: string,
  anteriores: unknown,
  nuevos: unknown,
): Promise<string | null> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_email: actor,
      entidad,
      registro_id: registro,
      accion,
      anteriores,
      nuevos,
    });
    if (error) return `No se pudo auditar ${accion}: ${error.message}`;
    return null;
  } catch (e) {
    return `No se pudo auditar ${accion}: ${e instanceof Error ? e.message : 'error'}`;
  }
}

export function descargarCsv(rows: Array<Record<string, unknown>>, nombre: string) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const texto = [
    cols.join(','),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(',')),
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + texto], { type: 'text/csv' }));
  a.download = nombre;
  a.click();
}

export function fechaHora(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR');
  } catch {
    return String(iso);
  }
}

export function fechaCorta(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-AR');
  } catch {
    return String(iso);
  }
}

/** Tonos de etiqueta: siempre texto + símbolo, nunca solo color. */
export type Tono = 'ok' | 'info' | 'alerta' | 'error' | 'neutro';

export const TONOS: Record<Tono, string> = {
  ok: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  info: 'bg-sky-100 text-sky-900 border-sky-300',
  alerta: 'bg-amber-100 text-amber-900 border-amber-300',
  error: 'bg-red-100 text-red-900 border-red-300',
  neutro: 'bg-stone-200 text-stone-800 border-stone-300',
};

export const TONO_ASISTENCIA: Record<string, Tono> = {
  pendiente: 'alerta',
  confirmado: 'ok',
  no_asistira: 'neutro',
  modificado: 'info',
};

export const TEXTO_ASISTENCIA: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  no_asistira: 'No asistirá',
  modificado: 'Modificado',
};

export const TONO_PAGO: Record<string, Tono> = {
  no_corresponde: 'neutro',
  pendiente_pago: 'alerta',
  pago_informado: 'info',
  pago_verificado: 'ok',
  requiere_revision: 'error',
};

export const TEXTO_PAGO: Record<string, string> = {
  no_corresponde: 'No corresponde',
  pendiente_pago: 'Pendiente de pago',
  pago_informado: 'Informado (sin verificar)',
  pago_verificado: 'Verificado',
  requiere_revision: 'Requiere revisión',
};
