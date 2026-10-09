/**
 * XV-ANTONELLA · Tipos compartidos (fuente de verdad del frontend).
 * El esquema SQL vive en `supabase/migrations/0001_xv_schema.sql`.
 * Convención: snake_case en DB, camelCase solo en objetos locales si hace falta.
 */

export type AttendanceStatus = 'pendiente' | 'confirmado' | 'no_asistira' | 'modificado';
export type PaymentStatus =
  | 'no_corresponde'
  | 'pendiente_pago'
  | 'pago_informado'
  | 'pago_verificado'
  | 'requiere_revision';

export interface EventSettings {
  id: string;
  quinceanera: string;
  evento: string;
  fecha: string; // YYYY-MM-DD (inicio)
  hora_inicio: string; // HH:MM
  hora_fin: string; // HH:MM (día siguiente)
  fecha_fin: string; // YYYY-MM-DD
  zona_horaria: string;
  salon: string;
  direccion: string;
  vestimenta: string;
  fecha_limite_confirmacion: string;
  fecha_limite_pago: string;
  precio_tarjeta: number;
  edad_minima_paga: number; // regla: menores de N años no abonan
  whatsapp_comprobantes: string; // solo dígitos, con código país+área
  alias_transferencia: string;
  titular_transferencia: string;
  mensaje_final: string;
  created_at: string;
  updated_at: string;
}

export interface Guest {
  id: string;
  nombre_apellido: string;
  email: string;
  telefono: string | null;
  asistencia: AttendanceStatus;
  apellido_familiar: string | null;
  cantidad_adultos: number;
  cantidad_menores: number;
  restricciones: string | null;
  observaciones: string | null;
  importe_estimado: number;
  estado_pago: PaymentStatus;
  pago_informado_at: string | null;
  pago_verificado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendee {
  id: string;
  guest_id: string;
  nombre: string;
  edad_al_evento: number | null;
  es_titular: boolean;
  debe_abonar: boolean;
  created_at: string;
}

export interface GuestGroup {
  id: string;
  nombre: string;
  manual: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  guest_id: string;
  monto: number;
  estado: PaymentStatus;
  medio: string | null;
  comprobante_url: string | null;
  token_accion: string;
  informado_at: string | null;
  verificado_at: string | null;
  created_at: string;
}

export interface ContentSection {
  id: string;
  clave: string;
  titulo: string | null;
  cuerpo: string | null;
  visible: boolean;
  orden: number;
  updated_at: string;
}

export interface GalleryImage {
  id: string;
  storage_path: string;
  url_publica: string | null;
  epigrafe: string | null;
  orden: number;
  demo: boolean;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  clave: string;
  asunto: string;
  cuerpo: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  guest_id: string | null;
  tipo: string;
  destinatario: string;
  asunto: string;
  estado: string;
  intentos: number;
  error: string | null;
  idempotencia_clave: string;
  enviado_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_email: string | null;
  entidad: string;
  registro_id: string | null;
  accion: string;
  anteriores: unknown | null;
  nuevos: unknown | null;
  created_at: string;
}

export interface ConfigurationVersion {
  id: string;
  nombre: string;
  descripcion: string | null;
  datos: unknown;
  creado_por: string | null;
  created_at: string;
}

export type Screen = 'invitacion' | 'confirmar' | 'admin' | 'ya-abone';
