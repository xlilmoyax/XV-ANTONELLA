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

export function formatoARS(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}
