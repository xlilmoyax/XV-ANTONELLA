/**
 * XV-ANTONELLA · Configuración inicial oficial del evento.
 * ÚNICA fuente de valores por defecto en el frontend.
 * En producción estos valores viven en Supabase (`event_settings`, una fila)
 * y se editan desde el panel. Este objeto solo se usa como fallback
 * cuando Supabase aún no está configurado.
 */

export interface EventForm {
  quinceanera: string;
  evento: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  fecha_fin: string;
  zona_horaria: string;
  salon: string;
  direccion: string;
  vestimenta: string;
  fecha_limite_confirmacion: string;
  fecha_limite_pago: string;
  precio_tarjeta: number;
  edad_minima_paga: number; // los menores de N años no abonan
  whatsapp_comprobantes: string;
  alias_transferencia: string;
  titular_transferencia: string;
  mensaje_final: string;
}

export const DEFAULT_EVENT: EventForm = {
  quinceanera: 'Antonella',
  evento: 'Mis XV años',
  fecha: '2026-12-19',
  hora_inicio: '21:00',
  hora_fin: '05:00',
  fecha_fin: '2026-12-20',
  zona_horaria: 'America/Argentina/Buenos_Aires',
  salon: 'Salón Aldo',
  direccion: 'C. José Ramonda 6637',
  vestimenta: 'Formal',
  fecha_limite_confirmacion: '2026-11-25',
  fecha_limite_pago: '2026-12-10',
  precio_tarjeta: 0,
  edad_minima_paga: 0,
  whatsapp_comprobantes: '',
  alias_transferencia: '',
  titular_transferencia: '',
  mensaje_final: '',
};

/** Enlace oficial del formulario de canciones. NO sustituir ni duplicar. */
export const MUSIC_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScfF9rxl_apFykZkPBGrhsihDqvuVFzHt0dVClowfXqMQ-G3Q/viewform?usp=publish-editor';

/** Días entre recordatorios de pago (valor inicial editable desde el panel). */
export const DEFAULT_REMINDER_EVERY_DAYS = 10;

export function mapsUrl(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

export function whatsappUrl(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Genera un .ics para "Agregar a mi calendario" (fecha/hora/zona correctas). */
export function buildIcsEvent(input: {
  titulo: string;
  descripcion: string;
  ubicacion: string;
  fecha: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
}): string {
  const stamp = (f: string, h: string) => `${f.replaceAll('-', '')}T${h.replace(':', '')}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//XV-ANTONELLA//ES',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@xv-antonella`,
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${stamp(input.fecha, input.hora_inicio)}`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${stamp(input.fecha_fin, input.hora_fin)}`,
    `SUMMARY:${input.titulo}`,
    `DESCRIPTION:${input.descripcion}`,
    `LOCATION:${input.ubicacion}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
}
