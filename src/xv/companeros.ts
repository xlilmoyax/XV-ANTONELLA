/**
 * XV-ANTONELLA · Reglas puras de la tarjeta Compañeros (testeables sin backend).
 * Registro individual: 1 persona, 0 acompañantes. Sin exenciones: todos abonan.
 */
import { calcularImporteModalidad } from './pricing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface DatosB {
  nombre: string;
  email: string;
  telefono: string;
  asiste: boolean;
  /** Edad al día de la fiesta (texto libre, opcional). */
  edadTitular: string;
  /* restricciones: eliminadas del formulario (columna DB intacta). */
}

export function validarB(d: DatosB): string | null {
  if (d.nombre.trim().length < 3) return 'Contanos tu nombre y apellido.';
  if (!EMAIL_RE.test(d.email.trim())) return 'Revisá el correo electrónico: no parece válido.';
  if (d.edadTitular.trim() !== '') {
    const n = Number.parseInt(d.edadTitular, 10);
    if (!Number.isFinite(n) || n < 0 || n > 120) return 'Revisá tu edad (en años, al día de la fiesta).';
  }
  return null;
}

/** Importe individual: precio vigente o 0 si no asiste. */
export function importeB(asiste: boolean, precioTarjeta: number): number {
  return asiste ? calcularImporteModalidad('companeros', [null], 1, 0, precioTarjeta, null).importe : 0;
}

/**
 * Payload para el endpoint RSVP. El servidor obtiene la modalidad
 * exclusivamente desde la invitación firmada.
 */
export function payloadB(d: DatosB) {
  return {
    nombre_apellido: d.nombre.trim(),
    email: d.email.trim().toLowerCase(),
    telefono: d.telefono.trim() || null,
    asiste: d.asiste,
    familia: null,
    adultos: d.asiste ? 1 : 0,
    menores: 0,
    edad_titular: d.edadTitular.trim() === '' ? null : d.edadTitular.trim(),
    acompanantes: [],
  };
}
