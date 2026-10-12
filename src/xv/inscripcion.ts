/**
 * XV-ANTONELLA · Reglas puras de inscripción (sin backend, testeables).
 *
 * - Un correo normalizado (trim + minúsculas; citext lo refuerza en DB) tiene
 *   como máximo UNA inscripción VIGENTE por modalidad.
 * - Vigente = asistencia distinta de 'no_asistira' Y correo no archivado.
 * - Archivar = renombrar el correo a un alias único `@archivados.local`:
 *   libera el correo real (el UNIQUE lo deja de ver) y conserva TODA la
 *   historia vinculada (acompañantes, pagos, envíos, grupos, auditoría).
 *   Reversible: el correo original queda en la auditoría ('archivar').
 * - Sin modalidad_id en una o ambas filas se usa el criterio conservador
 *   (misma bolsa): coincide con el UNIQUE(email) vigente hoy en la DB.
 */

export const DOMINIO_ARCHIVO = 'archivados.local';

/** Normalización canónica de correo (la DB usa citext: insensible a mayúsculas). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Alias único de archivado para un guest id (estable y reversible vía auditoría). */
export function emailArchivadoPara(guestId: string): string {
  return `eliminado+${guestId.slice(0, 8)}@archivados.local`;
}

/** ¿Es un alias de archivado (no un correo real)? */
export function esArchivada(email: string): boolean {
  return normalizarEmail(email).endsWith(`@${DOMINIO_ARCHIVO}`);
}

type FilaInscripcion = {
  email: string;
  asistencia: string;
  modalidad_id?: string | null;
};

/** Inscripción vigente: cuenta para la unicidad y para el panel activo. */
export function esVigente(g: FilaInscripcion): boolean {
  return g.asistencia !== 'no_asistira' && !esArchivada(g.email);
}

/**
 * ¿Existe ya una inscripción vigente que bloquee (email, modalidad)?
 * - Misma modalidad (o criterio conservador sin UUIDs) + vigente → true.
 * - Modalidades distintas con UUID en ambas → false (una por modalidad).
 * Puro: el árbitro final ante concurrencia es el índice único en la DB.
 */
export function hayVigente(
  guests: FilaInscripcion[],
  email: string,
  modalidadId?: string | null,
): boolean {
  const buscado = normalizarEmail(email);
  return guests.some((g) => {
    if (normalizarEmail(g.email) !== buscado || !esVigente(g)) return false;
    const a = g.modalidad_id ?? null;
    const b = modalidadId ?? null;
    if (a !== null && b !== null) return a === b;
    // Sin UUID en algún lado: criterio conservador (misma bolsa, como hoy).
    return true;
  });
}
