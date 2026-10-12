-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0009 · Seed de textos de la tarjeta Compañeros
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
--
-- POR QUÉ: las filas b_* nunca se sembraron (0006 lo difirió a "panel o seed
-- posterior") y casi todos los textos de B estaban fijos en el código: la
-- pestaña Compañeros mostraba "Sin textos en esta tarjeta".
-- QUÉ: inserta las 43 claves del catálogo src/xv/textosB.ts con sus
-- valores actuales (la tarjeta pública se ve IGUAL antes y después).
-- IDEMPOTENTE: on conflict (clave) do nothing (no pisa ediciones existentes).
-- ALTERNATIVA SIN SQL: crear cada clave desde el panel (Tarjetas → B →
-- "Textos aún no creados" → CREAR). RLS: escritura solo admin (cs_admin).
-- ROLLBACK: delete from content_sections where clave like 'b\_%';
-- ============================================================

insert into content_sections (clave, titulo, cuerpo, visible, orden)
values
  ('b_portada_titulo', 'Título de portada', 'MIS XV AÑOS · COMPAÑEROS', true, 100),
  ('b_portada_frase', 'Frase de portada', 'Una invitación personal para compartir una noche mágica.', true, 101),
  ('b_portada_boton', 'Botón de portada', 'DESCUBRIR MI INVITACIÓN', true, 102),
  ('b_presentacion_kicker', 'Subtítulo presentación', 'Bienvenidos', true, 103),
  ('b_presentacion_titulo', 'Título presentación', 'Mis XV', true, 104),
  ('b_presentacion_texto', 'Texto presentación', '', true, 105),
  ('b_info_kicker', 'Subtítulo información', 'Cuándo y dónde', true, 106),
  ('b_info_titulo', 'Título información', 'Información del evento', true, 107),
  ('b_info_boton_mapa', 'Botón cómo llegar', 'CÓMO LLEGAR', true, 108),
  ('b_info_boton_calendario', 'Botón calendario', 'AGREGAR A MI CALENDARIO', true, 109),
  ('b_info_boton_confirmar', 'Botón confirmar (info)', 'CONFIRMAR ASISTENCIA', true, 110),
  ('b_cuenta_kicker', 'Subtítulo cuenta regresiva', 'Falta cada vez menos', true, 111),
  ('b_cuenta_titulo', 'Título cuenta regresiva', 'Cuenta regresiva', true, 112),
  ('b_pagos_kicker', 'Subtítulo pagos', 'Confirmar y abonar', true, 113),
  ('b_pagos_titulo', 'Título pagos', 'Datos para confirmar y abonar', true, 114),
  ('b_pagos_tarjeta', 'Línea de tarjeta', 'Tarjeta individual: [Precio] por invitado.', true, 115),
  ('b_pagos_alias', 'Etiqueta alias', 'Alias', true, 116),
  ('b_pagos_titular', 'Línea titular', 'Titular: [Titular]', true, 117),
  ('b_pagos_limites', 'Línea de límites', 'Confirmar antes del [LimiteConfirmacion] · Pagar antes del [LimitePago].', true, 118),
  ('b_pagos_boton_whatsapp', 'Botón comprobante', 'ENVIAR COMPROBANTE POR WHATSAPP', true, 119),
  ('b_pagos_boton_confirmar', 'Botón confirmar (pagos)', 'CONFIRMAR ASISTENCIA', true, 120),
  ('b_form_kicker', 'Subtítulo formulario', 'RSVP · Individual', true, 121),
  ('b_form_titulo', 'Título formulario', 'Confirmar asistencia', true, 122),
  ('b_form_gracias_kicker', 'Subtítulo agradecimiento', 'Confirmación', true, 123),
  ('b_form_gracias_titulo', 'Título agradecimiento', '¡Gracias por confirmar!', true, 124),
  ('b_form_exito_si', 'Mensaje éxito (asiste)', '¡Te esperamos!', true, 125),
  ('b_form_exito_no', 'Mensaje éxito (no asiste)', 'Gracias por avisarnos.', true, 126),
  ('b_form_email_ok', 'Línea de confirmación enviada', '¡Gracias por confirmar tu asistencia a los XV de Antonella!', true, 127),
  ('b_form_limite', 'Línea de límite', 'Invitación personal · Límite: [Limite]', true, 128),
  ('b_form_nombre', 'Etiqueta nombre', 'Nombre y apellido *', true, 129),
  ('b_form_correo', 'Etiqueta correo', 'Correo electrónico *', true, 130),
  ('b_form_telefono', 'Etiqueta teléfono', 'Teléfono (opcional)', true, 131),
  ('b_form_edad', 'Etiqueta edad', 'Tu edad al día de la fiesta (opcional)', true, 132),
  ('b_form_pregunta', 'Pregunta asistencia', '¿Asistís? *', true, 133),
  ('b_form_si', 'Botón sí', 'SÍ, VOY', true, 134),
  ('b_form_no', 'Botón no', 'NO PUEDO IR', true, 135),
  ('b_form_precio_nota', 'Nota de precio', 'Tarjeta individual · Límite de pago: [LimitePago]', true, 136),
  ('b_form_importe', 'Línea de importe', 'Importe: [Importe]', true, 137),
  ('b_form_boton_wa', 'Botón WhatsApp (éxito)', 'AVISAR POR WHATSAPP', true, 138),
  ('b_form_enviar', 'Botón enviar', 'CONFIRMAR', true, 139),
  ('b_pie_linea', 'Línea del pie', '[Quinceanera] · 19.12.2026 · Compañeros', true, 140),
  ('b_pie_ubicacion', 'Enlace ubicación', 'Ubicación', true, 141),
  ('b_pie_confirmacion', 'Enlace confirmación', 'Confirmación', true, 142)
on conflict (clave) do nothing;
