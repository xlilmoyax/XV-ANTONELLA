/**
 * XV-ANTONELLA · Reglas de precio y edad en UN solo lugar.
 * Nada de constantes duplicadas en componentes.
 */

export function edadAlEvento(fechaNacimientoISO: string, fechaEventoISO: string): number {
  const n = new Date(fechaNacimientoISO + 'T12:00:00');
  const e = new Date(fechaEventoISO + 'T12:00:00');
  let edad = e.getFullYear() - n.getFullYear();
  const m = e.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && e.getDate() < n.getDate())) edad -= 1;
  return Math.max(0, edad);
}

/** true si la persona debe abonar según la regla vigente. */
export function debeAbonar(edadAlEvento: number | null, edadMinimaPaga: number): boolean {
  if (edadAlEvento === null || Number.isNaN(edadAlEvento)) return true; // adulto sin edad cargada
  return edadAlEvento >= edadMinimaPaga;
}

export function importeEstimado(cantidadQueAbonan: number, precioTarjeta: number): number {
  return Math.max(0, cantidadQueAbonan) * Math.max(0, precioTarjeta);
}

export type CodigoModalidad = 'familia_amigos' | 'companeros';

export interface CalculoModalidad {
  importe: number;
  personasQueAbonan: number;
  error: string | null;
}

/** Calculates only from a verified modality and the recorded attendee ages. */
export function calcularImporteModalidad(
  modalidad: string | null,
  edades: Array<number | null>,
  adultos: number,
  menores: number,
  precioTarjeta: number,
  edadMinimaPaga: number | null,
): CalculoModalidad {
  if (modalidad !== 'familia_amigos' && modalidad !== 'companeros') {
    return { importe: 0, personasQueAbonan: 0, error: 'Modalidad sin clasificar o desconocida.' };
  }
  if (
    !Number.isInteger(adultos) ||
    !Number.isInteger(menores) ||
    adultos < 0 ||
    menores < 0 ||
    adultos + menores !== edades.length
  ) {
    return { importe: 0, personasQueAbonan: 0, error: 'Las cantidades no coinciden con las personas registradas.' };
  }
  if (!Number.isInteger(precioTarjeta) || precioTarjeta <= 0) {
    return { importe: 0, personasQueAbonan: 0, error: 'La configuración del importe no es válida.' };
  }
  if (modalidad === 'companeros') {
    if (edades.length !== 1) {
      return { importe: 0, personasQueAbonan: 0, error: 'Compañeros admite una sola persona y ningún acompañante.' };
    }
    return { importe: importeEstimado(1, precioTarjeta), personasQueAbonan: 1, error: null };
  }
  if (!Number.isInteger(edadMinimaPaga) || edadMinimaPaga === null || edadMinimaPaga < 0) {
    return { importe: 0, personasQueAbonan: 0, error: 'La regla de edad no es válida.' };
  }
  if (edades.some((edad) => edad === null || !Number.isInteger(edad) || edad < 0 || edad > 120)) {
    return { importe: 0, personasQueAbonan: 0, error: 'Falta una edad necesaria para validar la exención familiar.' };
  }
  const personasQueAbonan = edades.filter((edad) => debeAbonar(edad, edadMinimaPaga)).length;
  return { importe: importeEstimado(personasQueAbonan, precioTarjeta), personasQueAbonan, error: null };
}

export function formatoARS(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}
