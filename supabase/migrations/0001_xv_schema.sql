-- ============================================================
-- XV-ANTONELLA · Migración 0001 · Esquema inicial
-- Fuente de verdad de cada dato:
--   event_settings        -> configuración del evento (1 fila activa)
--   guests                -> cada formulario de confirmación (1 fila por email)
--   attendees             -> personas incluidas en cada confirmación
--   guest_groups/members  -> agrupación familiar (manual prevalece)
--   payment_records       -> avisos y verificación de pagos
--   content_sections      -> textos editables de la invitación
--   gallery_images        -> galería (archivos en Storage `galeria`)
--   email_templates/logs  -> plantillas editables e historial de envíos
--   admin_profiles        -> quién es admin ( enlaza auth.users )
--   audit_logs            -> historial de cambios administrativos
--   configuration_versions-> snapshots recuperables de la configuración
-- ============================================================

-- ---------- utilidades ----------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function xv_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- event_settings ----------
create table event_settings (
  id uuid primary key default gen_random_uuid(),
  quinceanera text not null default 'Antonella',
  evento text not null default 'Mis XV años',
  fecha date not null default '2026-12-19',
  hora_inicio time not null default '21:00',
  hora_fin time not null default '05:00',
  fecha_fin date not null default '2026-12-20',
  zona_horaria text not null default 'America/Argentina/Buenos_Aires',
  salon text not null default 'Salón Aldo',
  direccion text not null default 'C. José Ramonda 6637',
  vestimenta text not null default 'Formal',
  fecha_limite_confirmacion date not null default '2026-11-25',
  fecha_limite_pago date not null default '2026-12-10',
  precio_tarjeta integer not null default 70000 check (precio_tarjeta >= 0),
  edad_minima_paga integer not null default 10 check (edad_minima_paga >= 0),
  whatsapp_comprobantes text not null default '543518188659',
  alias_transferencia text not null default 'LOPEZGUADACRISTINA05',
  titular_transferencia text not null default 'Guadalupe Cristina López',
  mensaje_final text not null default '',
  recordatorio_cada_dias integer not null default 10 check (recordatorio_cada_dias >= 1),
  recordatorios_activos boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- guests ----------
create table guests (
  id uuid primary key default gen_random_uuid(),
  nombre_apellido text not null check (char_length(nombre_apellido) >= 3),
  email citext not null,
  telefono text,
  asistencia text not null default 'pendiente'
    check (asistencia in ('pendiente','confirmado','no_asistira','modificado')),
  apellido_familiar text,
  cantidad_adultos integer not null default 1 check (cantidad_adultos >= 0),
  cantidad_menores integer not null default 0 check (cantidad_menores >= 0),
  restricciones text,
  observaciones text,
  importe_estimado integer not null default 0 check (importe_estimado >= 0),
  estado_pago text not null default 'pendiente_pago'
    check (estado_pago in ('no_corresponde','pendiente_pago','pago_informado','pago_verificado','requiere_revision')),
  pago_informado_at timestamptz,
  pago_verificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_email_unico unique (email)
);
create index guests_asistencia_idx on guests (asistencia);
create index guests_estado_pago_idx on guests (estado_pago);
create index guests_familiar_idx on guests (apellido_familiar);

-- ---------- attendees ----------
create table attendees (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id) on delete cascade,
  nombre text not null,
  edad_al_evento integer check (edad_al_evento is null or edad_al_evento >= 0),
  es_titular boolean not null default false,
  debe_abonar boolean not null default true,
  created_at timestamptz not null default now()
);
create index attendees_guest_idx on attendees (guest_id);

-- ---------- guest_groups ----------
create table guest_groups (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  manual boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references guest_groups (id) on delete cascade,
  guest_id uuid not null references guests (id) on delete cascade,
  rol text not null default 'miembro' check (rol in ('titular','miembro')),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  constraint group_members_unico unique (group_id, guest_id)
);

-- ---------- payment_records ----------
create table payment_records (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id) on delete cascade,
  monto integer not null default 0 check (monto >= 0),
  estado text not null default 'pago_informado'
    check (estado in ('no_corresponde','pendiente_pago','pago_informado','pago_verificado','requiere_revision')),
  medio text,
  comprobante_url text,
  token_accion text not null default encode(gen_random_bytes(24), 'hex'),
  informado_at timestamptz default now(),
  verificado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_token_unico unique (token_accion)
);
create index payments_guest_idx on payment_records (guest_id);
create index payments_estado_idx on payment_records (estado);

-- ---------- content_sections ----------
create table content_sections (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  titulo text,
  cuerpo text,
  visible boolean not null default true,
  orden integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- gallery_images ----------
create table gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  url_publica text,
  epigrafe text,
  orden integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- email_templates / email_logs ----------
create table email_templates (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  asunto text not null,
  cuerpo text not null,
  updated_at timestamptz not null default now()
);
create table email_logs (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references guests (id) on delete set null,
  tipo text not null,
  destinatario text not null,
  asunto text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviado','fallido')),
  intentos integer not null default 0,
  error text,
  idempotencia_clave text not null unique,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_logs_guest_idx on email_logs (guest_id);
create index email_logs_estado_idx on email_logs (estado);

-- ---------- admin / auditoría / versiones ----------
create table admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  nombre text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  entidad text not null,
  registro_id text,
  accion text not null,
  anteriores jsonb,
  nuevos jsonb,
  created_at timestamptz not null default now()
);
create index audit_entidad_idx on audit_logs (entidad, registro_id);
create table configuration_versions (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  datos jsonb not null,
  creado_por text,
  created_at timestamptz not null default now()
);

-- ---------- triggers updated_at ----------
create trigger t_event_settings before update on event_settings
  for each row execute function xv_touch_updated_at();
create trigger t_guests before update on guests
  for each row execute function xv_touch_updated_at();
create trigger t_groups before update on guest_groups
  for each row execute function xv_touch_updated_at();

-- ============================================================
-- RLS · Denegar por defecto, abrir solo lo necesario
-- ============================================================
alter table event_settings enable row level security;
alter table guests enable row level security;
alter table attendees enable row level security;
alter table guest_groups enable row level security;
alter table group_members enable row level security;
alter table payment_records enable row level security;
alter table content_sections enable row level security;
alter table gallery_images enable row level security;
alter table email_templates enable row level security;
alter table email_logs enable row level security;
alter table admin_profiles enable row level security;
alter table audit_logs enable row level security;
alter table configuration_versions enable row level security;

-- helper: ¿es admin activo?
create or replace function xv_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_profiles
    where user_id = auth.uid() and activo = true
  );
$$;

-- event_settings: lectura pública, escritura solo admin
create policy ev_read on event_settings for select using (true);
create policy ev_admin on event_settings for all using (xv_es_admin()) with check (xv_es_admin());

-- content_sections / gallery: lectura pública, escritura solo admin
create policy cs_read on content_sections for select using (true);
create policy cs_admin on content_sections for all using (xv_es_admin()) with check (xv_es_admin());
create policy gal_read on gallery_images for select using (true);
create policy gal_admin on gallery_images for all using (xv_es_admin()) with check (xv_es_admin());

-- guests: el público SOLO puede insertar su propia confirmación.
-- Nadie anónimo puede leer ni modificar registros ajenos.
create policy g_insert on guests for insert with check (true);
create policy g_admin on guests for all using (xv_es_admin()) with check (xv_es_admin());

-- attendees: el público SOLO puede insertar junto a su confirmación.
create policy a_insert on attendees for insert with check (true);
create policy a_admin on attendees for all using (xv_es_admin()) with check (xv_es_admin());

-- pagos, grupos, correos, auditoría, versiones: solo admin vía app.
-- (El "Ya Aboné" se procesa en Edge Function con service_role, nunca con anon key.)
create policy pr_admin on payment_records for all using (xv_es_admin()) with check (xv_es_admin());
create policy gg_admin on guest_groups for all using (xv_es_admin()) with check (xv_es_admin());
create policy gm_admin on group_members for all using (xv_es_admin()) with check (xv_es_admin());
create policy et_admin on email_templates for all using (xv_es_admin()) with check (xv_es_admin());
create policy el_admin on email_logs for all using (xv_es_admin()) with check (xv_es_admin());
create policy ap_admin on admin_profiles for all using (xv_es_admin()) with check (xv_es_admin());
create policy au_admin on audit_logs for all using (xv_es_admin()) with check (xv_es_admin());
create policy cv_admin on configuration_versions for all using (xv_es_admin()) with check (xv_es_admin());

-- ---------- Storage: bucket `galeria` ----------
insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do nothing;

create policy galeria_public_read on storage.objects
  for select using (bucket_id = 'galeria');
create policy galeria_admin_write on storage.objects
  for all using (bucket_id = 'galeria' and xv_es_admin())
  with check (bucket_id = 'galeria' and xv_es_admin());
