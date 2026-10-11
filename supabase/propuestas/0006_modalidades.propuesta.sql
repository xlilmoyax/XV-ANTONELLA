-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0006 · Modalidades de invitación (FASE A: sin corte)
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
--
-- ESTRATEGIA CERO-VENTANA: esta fase NO rompe el frontend actual.
--   - guests.modalidad_id llega NULLABLE y g_insert admite NULL o familiares:
--     el frontend vigente (sin ese campo) sigue registrando sin interrupción.
--   - Recién la 0007 (fase B, tras verificar frontend con UUID en producción)
--     pone NOT NULL, cambia la unicidad y endurece g_insert a solo-familiares.
-- Orden: 0006 → frontend-compat → verificar → 0007 → 0003-final → tarjeta B.
-- Nombres finales al mover a migrations/: 0003_modalidades_a, [0004_rpc =
--   contenido de propuesta 0003], [0005_chat = propuesta 0005 verbatim],
--   [0006_retiro = contenido de propuesta 0004], 0007_modalidad_notnull.
--
-- DECISIÓN: dimensión `modalidades` + `guests.modalidad_id`.
-- Rechazado: tablas gemelas, segundo event_settings, dos apps/paneles/DB.
--
-- QUÉ QUEDA DÓNDE (anti-duplicación):
--   event_settings (global, sin cambios): quinceañera, fecha, zona horaria,
--     salón, dirección, whatsapp/alias/titular (idénticos en la referencia B),
--     recordatorios, mensaje_final de A.
--   modalidades (por tarjeta): código, nombre, precio, horarios, límites,
--     vestimenta, permite_acompanantes, regla de edad (NULL = sin exención).
--   Contenidos/imágenes B: filas nuevas (claves b_*, diseno_b_*) — crea el
--     panel o seed posterior; textos finales de B aún pendientes del usuario.
--   Plantillas B: filas nuevas con claves propias (precios escritos difieren).
--   Galería: compartida, sin cambios. Storage: sin cambios.
--
-- SEGURIDAD:
--   - modalidades: lectura pública (config pública, como event_settings).
--   - g_insert admite NULL (transición) o familiares + checks 0002 intactos.
--     La tarjeta B NO tiene vía directa en ninguna fase (solo RPC validada).
--   - Subconsulta a modalidades dentro del WITH CHECK: funciona para anónimo
--     porque la tabla es pública en lectura (precedente: event_settings).
-- ROLLBACK: al final del archivo. Sin datos afectados (0 filas hoy).
-- ============================================================

create table modalidades (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  precio_tarjeta integer not null check (precio_tarjeta >= 0),
  hora_inicio time not null,
  hora_fin time not null,
  fecha_fin date not null,
  fecha_limite_confirmacion date not null,
  fecha_limite_pago date not null,
  vestimenta text not null default 'Formal',
  permite_acompanantes boolean not null,
  -- NULL = sin exención por edad (modalidad B: todos abonan).
  edad_minima_paga integer check (edad_minima_paga is null or edad_minima_paga >= 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed con los valores aprobados (fecha global 2026-12-19 en event_settings).
insert into modalidades (
  codigo, nombre, precio_tarjeta, hora_inicio, hora_fin, fecha_fin,
  fecha_limite_confirmacion, fecha_limite_pago, vestimenta,
  permite_acompanantes, edad_minima_paga, activa
) values
  ('familiares', 'Familiares y amigos', 70000, '21:00', '05:00', '2026-12-20',
   '2026-11-25', '2026-12-10', 'Formal', true, 10, true),
  ('companeros', 'Compañeros', 40000, '21:00', '02:00', '2026-12-20',
   '2026-11-25', '2026-12-10', 'Formal', false, null, true)
on conflict (codigo) do nothing; -- idempotente ante ejecución manual repetida

-- Fase A: columna NULLABLE (el frontend vigente no la envía y debe seguir
-- funcionando). El endurecimiento va en 0007, con frontend ya verificado.
alter table guests add column modalidad_id uuid references modalidades (id);
create index guests_modalidad_idx on guests (modalidad_id);

-- UNIQUE(email) se conserva en fase A (sigue frenando duplicados, NULLs incluidos).

-- Alcance por modalidad (NULL = fila histórica de A; B usa filas etiquetadas).
alter table content_sections add column modalidad_id uuid references modalidades (id);
alter table email_templates add column modalidad_id uuid references modalidades (id);
create index content_modalidad_idx on content_sections (modalidad_id);
create index templates_modalidad_idx on email_templates (modalidad_id);

-- Triggers updated_at existentes: modalidades usa xv_touch_updated_at (0001).
create trigger t_modalidades before update on modalidades
  for each row execute function xv_touch_updated_at();

-- RLS: modalidades pública en lectura; el resto hereda lo vigente.
alter table modalidades enable row level security;
create policy mod_read on modalidades for select using (true);
create policy mod_admin on modalidades
  for all using (xv_es_admin()) with check (xv_es_admin());

-- g_insert fase A: NULL (transición) o familiares + checks 0002 intactos.
drop policy if exists g_insert on guests;
create policy g_insert on guests
  for insert with check (
    (modalidad_id is null
      or modalidad_id = (select id from modalidades where codigo = 'familiares'))
    and asistencia in ('confirmado', 'no_asistira')
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

-- ============================================================
-- ROLLBACK MANUAL FASE A (no borra datos de invitados/pagos):
--   drop policy if exists g_insert on guests;
--   [recrear g_insert de 0002 sin cláusulas de modalidad]
--   drop policy if exists mod_read on modalidades;
--   drop policy if exists mod_admin on modalidades;
--   alter table email_templates drop column modalidad_id;
--   alter table content_sections drop column modalidad_id;
--   alter table guests drop column modalidad_id;
--   drop table modalidades;
-- ============================================================
