/**
 * XV-ANTONELLA · Catálogo único de textos editables de la tarjeta Compañeros.
 * Fuente única para el editor (Tarjetas → B) y los valores por defecto de la
 * tarjeta pública: agregar una clave aquí la hace editable sin tocar 2 lugares.
 * Tokens [EntreCorchetes] se sustituyen en render con aplicarPlantilla()
 * (misma convención que las plantillas de correo); los desconocidos se dejan
 * intactos. Los datos (fechas, precios, nombres, salón) NO son textos: vienen
 * de modalidades/event_settings y no se duplican aquí.
 */

export interface TextoBDef {
  clave: string;
  grupo: string;
  etiqueta: string;
  defecto: string;
  /** Texto genuinamente opcional (vacío = la tarjeta oculta ese bloque). */
  opcional?: boolean;
}

export const TEXTOS_B: TextoBDef[] = [
  { clave: 'b_portada_titulo', grupo: 'Portada', etiqueta: 'Título de portada', defecto: 'MIS XV AÑOS · COMPAÑEROS' },
  { clave: 'b_portada_frase', grupo: 'Portada', etiqueta: 'Frase de portada', defecto: 'Una invitación personal para compartir una noche mágica.' },
  { clave: 'b_portada_boton', grupo: 'Portada', etiqueta: 'Botón de portada', defecto: 'DESCUBRIR MI INVITACIÓN' },
  { clave: 'b_presentacion_kicker', grupo: 'Presentación', etiqueta: 'Subtítulo presentación', defecto: 'Bienvenidos' },
  { clave: 'b_presentacion_titulo', grupo: 'Presentación', etiqueta: 'Título presentación', defecto: 'Mis XV' },
  { clave: 'b_presentacion_texto', grupo: 'Presentación', etiqueta: 'Texto presentación', defecto: '', opcional: true },
  { clave: 'b_info_kicker', grupo: 'Información', etiqueta: 'Subtítulo información', defecto: 'Cuándo y dónde' },
  { clave: 'b_info_titulo', grupo: 'Información', etiqueta: 'Título información', defecto: 'Información del evento' },
  { clave: 'b_info_boton_mapa', grupo: 'Información', etiqueta: 'Botón cómo llegar', defecto: 'CÓMO LLEGAR' },
  { clave: 'b_info_boton_calendario', grupo: 'Información', etiqueta: 'Botón calendario', defecto: 'AGREGAR A MI CALENDARIO' },
  { clave: 'b_info_boton_confirmar', grupo: 'Información', etiqueta: 'Botón confirmar (info)', defecto: 'CONFIRMAR ASISTENCIA' },
  { clave: 'b_cuenta_kicker', grupo: 'Cuenta regresiva', etiqueta: 'Subtítulo cuenta regresiva', defecto: 'Falta cada vez menos' },
  { clave: 'b_cuenta_titulo', grupo: 'Cuenta regresiva', etiqueta: 'Título cuenta regresiva', defecto: 'Cuenta regresiva' },
  { clave: 'b_pagos_kicker', grupo: 'Pagos', etiqueta: 'Subtítulo pagos', defecto: 'Confirmar y abonar' },
  { clave: 'b_pagos_titulo', grupo: 'Pagos', etiqueta: 'Título pagos', defecto: 'Datos para confirmar y abonar' },
  { clave: 'b_pagos_tarjeta', grupo: 'Pagos', etiqueta: 'Línea de tarjeta', defecto: 'Tarjeta individual: [Precio] por invitado.' },
  { clave: 'b_pagos_alias', grupo: 'Pagos', etiqueta: 'Etiqueta alias', defecto: 'Alias' },
  { clave: 'b_pagos_titular', grupo: 'Pagos', etiqueta: 'Línea titular', defecto: 'Titular: [Titular]' },
  { clave: 'b_pagos_limites', grupo: 'Pagos', etiqueta: 'Línea de límites', defecto: 'Confirmar antes del [LimiteConfirmacion] · Pagar antes del [LimitePago].' },
  { clave: 'b_pagos_boton_whatsapp', grupo: 'Pagos', etiqueta: 'Botón comprobante', defecto: 'ENVIAR COMPROBANTE POR WHATSAPP' },
  { clave: 'b_pagos_boton_confirmar', grupo: 'Pagos', etiqueta: 'Botón confirmar (pagos)', defecto: 'CONFIRMAR ASISTENCIA' },
  { clave: 'b_form_kicker', grupo: 'Formulario', etiqueta: 'Subtítulo formulario', defecto: 'RSVP · Individual' },
  { clave: 'b_form_titulo', grupo: 'Formulario', etiqueta: 'Título formulario', defecto: 'Confirmar asistencia' },
  { clave: 'b_form_gracias_kicker', grupo: 'Formulario', etiqueta: 'Subtítulo agradecimiento', defecto: 'Confirmación' },
  { clave: 'b_form_gracias_titulo', grupo: 'Formulario', etiqueta: 'Título agradecimiento', defecto: '¡Gracias por confirmar!' },
  { clave: 'b_form_exito_si', grupo: 'Formulario', etiqueta: 'Mensaje éxito (asiste)', defecto: '¡Te esperamos!' },
  { clave: 'b_form_exito_no', grupo: 'Formulario', etiqueta: 'Mensaje éxito (no asiste)', defecto: 'Gracias por avisarnos.' },
  { clave: 'b_form_email_ok', grupo: 'Formulario', etiqueta: 'Línea de confirmación enviada', defecto: '¡Gracias por confirmar tu asistencia a los XV de Antonella!' },
  { clave: 'b_form_limite', grupo: 'Formulario', etiqueta: 'Línea de límite', defecto: 'Invitación personal · Límite: [Limite]' },
  { clave: 'b_form_nombre', grupo: 'Formulario', etiqueta: 'Etiqueta nombre', defecto: 'Nombre y apellido *' },
  { clave: 'b_form_correo', grupo: 'Formulario', etiqueta: 'Etiqueta correo', defecto: 'Correo electrónico *' },
  { clave: 'b_form_telefono', grupo: 'Formulario', etiqueta: 'Etiqueta teléfono', defecto: 'Teléfono (opcional)' },
  { clave: 'b_form_edad', grupo: 'Formulario', etiqueta: 'Etiqueta edad', defecto: 'Tu edad al día de la fiesta (opcional)' },
  { clave: 'b_form_pregunta', grupo: 'Formulario', etiqueta: 'Pregunta asistencia', defecto: '¿Asistís? *' },
  { clave: 'b_form_si', grupo: 'Formulario', etiqueta: 'Botón sí', defecto: 'SÍ, VOY' },
  { clave: 'b_form_no', grupo: 'Formulario', etiqueta: 'Botón no', defecto: 'NO PUEDO IR' },
  { clave: 'b_form_precio_nota', grupo: 'Formulario', etiqueta: 'Nota de precio', defecto: 'Tarjeta individual · Límite de pago: [LimitePago]' },
  { clave: 'b_form_importe', grupo: 'Formulario', etiqueta: 'Línea de importe', defecto: 'Importe: [Importe]' },
  { clave: 'b_form_boton_wa', grupo: 'Formulario', etiqueta: 'Botón WhatsApp (éxito)', defecto: 'AVISAR POR WHATSAPP' },
  { clave: 'b_form_enviar', grupo: 'Formulario', etiqueta: 'Botón enviar', defecto: 'CONFIRMAR' },
  { clave: 'b_pie_linea', grupo: 'Pie', etiqueta: 'Línea del pie', defecto: '[Quinceanera] · 19.12.2026 · Compañeros' },
  { clave: 'b_pie_ubicacion', grupo: 'Pie', etiqueta: 'Enlace ubicación', defecto: 'Ubicación' },
  { clave: 'b_pie_confirmacion', grupo: 'Pie', etiqueta: 'Enlace confirmación', defecto: 'Confirmación' },
];

/** Valor por defecto de una clave (cadena vacía si no existe: nunca rompe). */
export function defectoDe(clave: string): string {
  return TEXTOS_B.find((t) => t.clave === clave)?.defecto ?? '';
}

/** Sustituye tokens [Token] por sus valores; los desconocidos quedan intactos. */
export function aplicarPlantilla(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\[([A-Za-zÀ-ÿ]+)\]/g, (m, token: string) =>
    Object.prototype.hasOwnProperty.call(vars, token) ? vars[token] : m,
  );
}
