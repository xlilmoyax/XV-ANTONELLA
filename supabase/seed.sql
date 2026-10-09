-- ============================================================
-- XV-ANTONELLA · Seed inicial (valores oficiales del evento)
-- Ejecutar DESPUÉS de la migración 0001.
-- ============================================================

insert into event_settings (
  quinceanera, evento, fecha, hora_inicio, hora_fin, fecha_fin, zona_horaria,
  salon, direccion, vestimenta,
  fecha_limite_confirmacion, fecha_limite_pago,
  precio_tarjeta, edad_minima_paga,
  whatsapp_comprobantes, alias_transferencia, titular_transferencia,
  mensaje_final, recordatorio_cada_dias, recordatorios_activos
) values (
  'Antonella', 'Mis XV años', '2026-12-19', '21:00', '05:00', '2026-12-20',
  'America/Argentina/Buenos_Aires',
  'Salón Aldo', 'C. José Ramonda 6637', 'Formal',
  '2026-11-25', '2026-12-10',
  70000, 10,
  '543518188659', 'LOPEZGUADACRISTINA05', 'Guadalupe Cristina López',
  '', 10, true
);

insert into content_sections (clave, titulo, cuerpo, visible, orden) values
  ('portada_fecha', 'Fecha portada', '19.12.2026', true, 1),
  ('portada_evento', 'Título portada', 'MIS XV AÑOS', true, 2),
  ('portada_nombre', 'Nombre portada', 'Antonella', true, 3),
  ('portada_frase', 'Frase portada',
   '“Hay momentos que se sueñan toda la vida. El mío llegó, y quiero compartirlo con vos.”',
   true, 4),
  ('presentacion_titulo', 'Título presentación', 'Mis XV', true, 5),
  ('presentacion_texto', 'Texto presentación',
   '“Hoy celebramos una historia contada en sonrisas, abrazos y recuerdos. Esta es la historia de una niña que crece, sueña y se transforma en una joven llena de luz.”',
   true, 6),
  ('musica_titulo', 'Título música', '¿Qué canciones no pueden faltar?', true, 7),
  ('musica_texto', 'Texto música',
   '“¡Ayudame sugiriendo las canciones que pensás que no pueden faltar en la fiesta!”',
   true, 8),
  ('mensaje_final', 'Mensaje final', '', true, 9);

insert into email_templates (clave, asunto, cuerpo) values
  ('agradecimiento', '¡Gracias por confirmar tu asistencia a los XV de Antonella!',
   '¡Hola, [Nombre]!\n\n¡Muchas gracias por confirmar tu asistencia a los XV años de Antonella!\n\nNos alegra muchísimo saber que vas a acompañarnos en una noche tan especial, llena de alegría, emociones y momentos inolvidables.\n\nTe recordamos que el valor de la tarjeta es de $70.000 por persona que deba abonar. Los menores de 10 años no abonan.\n\nLa fecha límite de pago es el 10 de diciembre de 2026.\n\nPodés realizar la transferencia con los siguientes datos:\n\nAlias: LOPEZGUADACRISTINA05\nTitular: Guadalupe Cristina López.\n\nUna vez realizado el pago, hacé clic en el botón «Ya Aboné» de tu invitación para informarnos. Si corresponde, enviá también el comprobante al WhatsApp indicado.\n\n¡Gracias por ser parte de este momento tan importante para Antonella!\n\n¡Los esperamos para compartir una noche mágica e inolvidable!\n\nCon mucho cariño,\n\nAntonella y su familia.'),
  ('recordatorio_pago', 'Recordatorio · Tarjeta XV de Antonella',
   '¡Hola, [Nombre]! Te escribimos con mucho cariño para recordarte que aún figura pendiente la tarjeta de los XV de Antonella ([Importe]).\n\nAlias: LOPEZGUADACRISTINA05 · Titular: Guadalupe Cristina López.\nFecha límite de pago: 10 de diciembre de 2026.\n\nCuando la abones, tocá el botón «Ya Aboné» de tu invitación y, si corresponde, envianos el comprobante por WhatsApp. ¡Gracias por acompañarnos!');
