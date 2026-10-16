-- ============================================================
-- XV-ANTONELLA · Migración 0004 · Restaurar acceso público mínimo
-- Estado: PENDIENTE de aplicación explícita (db push).
--
-- MOTIVO:
--   La migración 0003 eliminó las políticas de lectura pública de
--   configuración (ev_read/cs_read/gal_read) y de inserción directa
--   (g_insert/a_insert) para cerrar el flujo por invitaciones firmadas.
--   Al restaurarse el flujo público estable (formulario abierto + panel),
--   esas políticas vuelven a ser necesarias. Sin ellas:
--   - la portada ignora la imagen del panel (fallback empaquetado),
--   - el formulario no puede verificar modalidad ni registrar invitados.
--
-- ALCANCE (solo políticas y permisos, cero cambios de datos):
--   - Lectura anónima: event_settings, content_sections, gallery_images,
--     modalidades (catálogo de precios/horarios, igual sensibilidad que
--     la configuración ya pública en 0001).
--   - Inserción anónima: guests (endurecido, idéntico a 0002) + attendees.
--   - NO toca: tablas, funciones RPC, triggers, datos, políticas admin,
--     ni accesos a pagos, correos, auditoría o perfiles.
--   - NO reabre: SELECT/UPDATE/DELETE anónimo en guests/attendees,
--     ni ningún acceso a payment_records, email_logs, admin_profiles.
--
-- SEGURIDAD (mínimo privilegio, igual que la era 0001+0002 que funcionaba):
--   - guests: INSERT gobernado SOLO por g_insert (admin no cubre INSERT).
--   - attendees: INSERT gobernado SOLO por a_insert (WITH CHECK true: la
--     tabla no tiene columnas de estados/pagos/privilegios).
--   - Re-ejecución segura: DROP IF EXISTS + CREATE (idempotente).
-- ============================================================

-- ---------- lectura pública de configuración ----------
drop policy if exists ev_read on event_settings;
create policy ev_read on event_settings
  for select using (true);

drop policy if exists cs_read on content_sections;
create policy cs_read on content_sections
  for select using (true);

drop policy if exists gal_read on gallery_images;
create policy gal_read on gallery_images
  for select using (true);

-- ---------- lectura pública del catálogo de modalidades ----------
-- El formulario verifica el UUID vigente antes de insertar; sin esta
-- lectura el registro se detiene por seguridad (no se infiere nada).
drop policy if exists mod_read on modalidades;
create policy mod_read on modalidades
  for select using (true);

grant select on event_settings, content_sections, gallery_images,
  modalidades to anon;

-- ---------- inserción directa del formulario público ----------
-- (idéntico a 0002: el cliente NO puede falsificar estados de pago,
-- asistencia, timestamps internos ni importes incoherentes)
drop policy if exists g_insert on guests;

create policy g_insert on guests
  for insert with check (
    asistencia in ('confirmado', 'no_asistira')
    and estado_pago in ('no_corresponde', 'pendiente_pago')
    and pago_informado_at is null
    and pago_verificado_at is null
    and (
      (asistencia = 'no_asistira'
        and cantidad_adultos = 0
        and cantidad_menores = 0
        and importe_estimado = 0)
      or (asistencia = 'confirmado'
        and (cantidad_adultos + cantidad_menores) between 1 and 40
        and ((estado_pago = 'no_corresponde' and importe_estimado = 0)
          or (estado_pago = 'pendiente_pago' and importe_estimado > 0)))
    )
  );

drop policy if exists a_insert on attendees;

create policy a_insert on attendees
  for insert with check (true);

grant insert on guests, attendees to anon;
