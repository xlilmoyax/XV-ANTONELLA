-- XV-ANTONELLA · Modalidades canónicas y RSVP calculado en servidor.
-- Aplicar solo después de revisar. Esta migración NO se ejecuta remotamente
-- desde este cambio y no clasifica ni actualiza invitados existentes.

create table modalidades (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique
    check (codigo in ('familia_amigos', 'companeros')),
  nombre text not null,
  precio_tarjeta integer not null check (precio_tarjeta > 0),
  hora_inicio time not null,
  hora_fin time not null,
  fecha_fin date not null,
  fecha_limite_confirmacion date not null,
  fecha_limite_pago date not null,
  vestimenta text not null default 'Formal',
  permite_acompanantes boolean not null,
  edad_minima_paga integer,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modalidades_reglas_canonicas check (
    (codigo = 'familia_amigos' and precio_tarjeta = 70000
      and hora_inicio = '21:00' and hora_fin = '05:00'
      and permite_acompanantes and edad_minima_paga = 10)
    or
    (codigo = 'companeros' and precio_tarjeta = 40000
      and hora_inicio = '21:00' and hora_fin = '02:00'
      and not permite_acompanantes and edad_minima_paga is null)
  )
);

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Harden the shared admin predicate against public/temp object shadowing.
create or replace function public.xv_es_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid() and activo = true
  );
$$;

insert into modalidades (
  codigo, nombre, precio_tarjeta, hora_inicio, hora_fin, fecha_fin,
  fecha_limite_confirmacion, fecha_limite_pago, permite_acompanantes,
  edad_minima_paga
) values
  ('familia_amigos', 'Familia y amigos', 70000, '21:00', '05:00',
   '2026-12-20', '2026-11-25', '2026-12-10', true, 10),
  ('companeros', 'Compañeros', 40000, '21:00', '02:00',
   '2026-12-20', '2026-11-25', '2026-12-10', false, null);

alter table guests
  add column modalidad_id uuid references modalidades(id);
create index guests_modalidad_idx on guests (modalidad_id);

alter table email_templates
  add column modalidad_id uuid references modalidades(id);
create index templates_modalidad_idx on email_templates (modalidad_id);

alter table email_logs
  add column modalidad_id uuid references modalidades(id);
create index email_logs_modalidad_idx on email_logs (modalidad_id);

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  modalidad_id uuid not null references modalidades(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  guest_id uuid references guests(id) on delete set null
);
create index invitaciones_modalidad_idx on invitaciones (modalidad_id);
alter table invitaciones enable row level security;
revoke all on table invitaciones from public, anon, authenticated;
grant select, insert, update on table invitaciones to service_role;

alter table modalidades enable row level security;
drop policy if exists mod_read on modalidades;
create policy mod_admin on modalidades
  for all using (xv_es_admin()) with check (xv_es_admin());
revoke all on table modalidades from public, anon, authenticated;
grant select on modalidades to authenticated, service_role;

-- Public configuration is delivered only by an invitation-authorized Edge Function.
drop policy if exists ev_read on event_settings;
drop policy if exists cs_read on content_sections;
drop policy if exists gal_read on gallery_images;
revoke all on table event_settings, content_sections, gallery_images from public, anon;
grant select, insert, update, delete on table event_settings, content_sections,
  gallery_images to authenticated, service_role;

-- These tables are private even if a broad project-level default grant exists.
revoke all on table guests, attendees, payment_records, guest_groups, group_members,
  email_templates, email_logs, admin_profiles, audit_logs, configuration_versions
  from public, anon;
grant select, insert, update, delete on table guests, attendees, payment_records,
  guest_groups, group_members, email_templates, email_logs, admin_profiles,
  audit_logs, configuration_versions to authenticated, service_role;

create trigger t_modalidades before update on modalidades
  for each row execute function xv_touch_updated_at();

-- All public RSVP writes go through the atomic SECURITY DEFINER RPC below.
-- Removing these policies closes direct guest/attendee insertion paths.
drop policy if exists g_insert on guests;
drop policy if exists a_insert on attendees;

drop function if exists registrar_rsvp(jsonb);

create or replace function registrar_rsvp(p_invitation_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_codigo text;
  v_modalidad_id uuid;
  v_precio integer;
  v_edad_minima integer;
  v_permite_acompanantes boolean;
  v_expires_at timestamptz;
  v_nombre text := nullif(btrim(payload ->> 'nombre_apellido'), '');
  v_email text := lower(nullif(btrim(payload ->> 'email'), ''));
  v_telefono text := nullif(btrim(payload ->> 'telefono'), '');
  v_familia text := nullif(btrim(payload ->> 'familia'), '');
  v_observaciones text := nullif(btrim(payload ->> 'observaciones'), '');
  v_asiste boolean := false;
  v_adultos integer := 0;
  v_menores integer := 0;
  v_total integer := 0;
  v_edad_titular integer;
  v_edad_texto text := nullif(btrim(payload ->> 'edad_titular'), '');
  v_acompanantes jsonb := coalesce(payload -> 'acompanantes', '[]'::jsonb);
  v_personas_que_abonan integer := 0;
  v_importe integer := 0;
  v_guest_id uuid := gen_random_uuid();
  v_persona jsonb;
  v_nombre_persona text;
  v_edad_persona integer;
  v_edad_persona_texto text;
begin
  if jsonb_typeof(payload) <> 'object' or p_invitation_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'invitacion');
  end if;

  select i.modalidad_id, m.codigo, m.precio_tarjeta, m.edad_minima_paga,
         m.permite_acompanantes, i.expires_at
    into v_modalidad_id, v_codigo, v_precio, v_edad_minima,
         v_permite_acompanantes, v_expires_at
  from public.invitaciones i
  join public.modalidades m on m.id = i.modalidad_id and m.activa
  where i.id = p_invitation_id and i.used_at is null
  for update of i;
  if v_modalidad_id is null or v_expires_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'invitacion');
  end if;

  begin
    v_asiste := coalesce((payload ->> 'asiste')::boolean, false);
    v_adultos := coalesce((payload ->> 'adultos')::integer, 0);
    v_menores := coalesce((payload ->> 'menores')::integer, 0);
    if v_edad_texto is not null then
      v_edad_titular := v_edad_texto::integer;
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', 'cantidades');
  end;

  if v_nombre is null or char_length(v_nombre) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nombre');
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    return jsonb_build_object('ok', false, 'motivo', 'email');
  end if;
  if v_edad_titular is not null and v_edad_titular not between 0 and 120 then
    return jsonb_build_object('ok', false, 'motivo', 'edad');
  end if;
  if jsonb_typeof(v_acompanantes) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'detalle');
  end if;
  if v_adultos not between 0 and 20 or v_menores not between 0 and 20 then
    return jsonb_build_object('ok', false, 'motivo', 'cantidades');
  end if;

  if v_asiste then
    v_total := v_adultos + v_menores;
    if v_adultos < 0 or v_menores < 0 or v_total not between 1 and 40 then
      return jsonb_build_object('ok', false, 'motivo', 'cantidades');
    end if;
    if jsonb_array_length(v_acompanantes) <> v_total - 1 then
      return jsonb_build_object('ok', false, 'motivo', 'detalle');
    end if;
    if not v_permite_acompanantes and v_total <> 1 then
      return jsonb_build_object('ok', false, 'motivo', 'detalle');
    end if;

    if v_codigo = 'familia_amigos' then
      if v_edad_titular is null then
        return jsonb_build_object('ok', false, 'motivo', 'edad');
      end if;
      if v_edad_titular >= v_edad_minima then
        v_personas_que_abonan := v_personas_que_abonan + 1;
      end if;
    else
      v_personas_que_abonan := 1;
    end if;

    for v_persona in select value from jsonb_array_elements(v_acompanantes)
    loop
      v_nombre_persona := nullif(btrim(v_persona ->> 'nombre'), '');
      v_edad_persona_texto := nullif(btrim(v_persona ->> 'edad'), '');
      if v_nombre_persona is null or char_length(v_nombre_persona) < 2 then
        return jsonb_build_object('ok', false, 'motivo', 'detalle');
      end if;
      begin
        if v_edad_persona_texto is not null then
          v_edad_persona := v_edad_persona_texto::integer;
        else
          v_edad_persona := null;
        end if;
      exception when others then
        return jsonb_build_object('ok', false, 'motivo', 'edad');
      end;
      if v_edad_persona is not null and v_edad_persona not between 0 and 120 then
        return jsonb_build_object('ok', false, 'motivo', 'edad');
      end if;
      if v_codigo = 'familia_amigos' then
        if v_edad_persona is null then
          return jsonb_build_object('ok', false, 'motivo', 'edad');
        end if;
        if v_edad_persona >= v_edad_minima then
          v_personas_que_abonan := v_personas_que_abonan + 1;
        end if;
      else
        v_personas_que_abonan := v_personas_que_abonan + 1;
      end if;
    end loop;
  else
    v_adultos := 0;
    v_menores := 0;
    v_acompanantes := '[]'::jsonb;
  end if;

  v_importe := v_personas_que_abonan * v_precio;

  begin
    insert into public.guests (
      id, modalidad_id, nombre_apellido, email, telefono, asistencia,
      apellido_familiar, cantidad_adultos, cantidad_menores,
      observaciones, importe_estimado, estado_pago
    ) values (
      v_guest_id, v_modalidad_id, v_nombre, v_email, v_telefono,
      case when v_asiste then 'confirmado' else 'no_asistira' end,
      v_familia, v_adultos, v_menores, v_observaciones, v_importe,
      case when v_personas_que_abonan = 0 then 'no_corresponde' else 'pendiente_pago' end
    );

    if v_asiste then
      insert into public.attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
      values (
        v_guest_id, v_nombre, v_edad_titular, true,
        case when v_codigo = 'companeros' then true
             else v_edad_titular >= v_edad_minima end
      );
      for v_persona in select value from jsonb_array_elements(v_acompanantes)
      loop
        v_nombre_persona := btrim(v_persona ->> 'nombre');
        v_edad_persona_texto := nullif(btrim(v_persona ->> 'edad'), '');
        v_edad_persona := case when v_edad_persona_texto is null
          then null else v_edad_persona_texto::integer end;
        insert into public.attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
        values (
          v_guest_id, v_nombre_persona, v_edad_persona, false,
          case when v_codigo = 'companeros' then true
               else v_edad_persona >= v_edad_minima end
        );
      end loop;
    end if;

    update public.invitaciones
    set used_at = now(), guest_id = v_guest_id
    where id = p_invitation_id and used_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'invitacion');
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest_id,
    'modalidad', v_codigo, 'importe', v_importe,
    'que_abonan', v_personas_que_abonan, 'total', v_total
  );
end;
$$;

revoke all on function registrar_rsvp(uuid, jsonb) from public, anon, authenticated;
grant execute on function registrar_rsvp(uuid, jsonb) to service_role;

create or replace function registrar_aviso_pago(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pago_id uuid;
  v_guest_id uuid;
  v_estado text;
  v_whatsapp text;
  v_informado_at timestamptz := now();
begin
  if p_token is null or char_length(p_token) < 32 then
    return jsonb_build_object('ok', false);
  end if;

  select p.id, p.guest_id, p.estado
    into v_pago_id, v_guest_id, v_estado
  from public.payment_records p
  where p.token_accion = p_token
  for update;

  if v_pago_id is null then
    return jsonb_build_object('ok', false);
  end if;

  select e.whatsapp_comprobantes into v_whatsapp
  from public.event_settings e
  limit 1;

  if v_estado in ('pago_informado', 'pago_verificado') then
    return jsonb_build_object('ok', true, 'duplicado', true, 'whatsapp', v_whatsapp);
  end if;

  update public.payment_records
  set estado = 'pago_informado', informado_at = v_informado_at
  where id = v_pago_id;
  update public.guests
  set estado_pago = 'pago_informado', pago_informado_at = v_informado_at
  where id = v_guest_id;

  insert into public.audit_logs (
    actor_email, entidad, registro_id, accion, nuevos
  ) values (
    'sistema:ya-abone', 'payment_records', v_pago_id::text,
    'pago_informado',
    jsonb_build_object('guest_id', v_guest_id, 'informado_at', v_informado_at)
  );

  return jsonb_build_object('ok', true, 'whatsapp', v_whatsapp);
end;
$$;

revoke all on function registrar_aviso_pago(text) from public, anon, authenticated;
grant execute on function registrar_aviso_pago(text) to service_role;

comment on column guests.modalidad_id is
  'NULL hasta clasificación manual; no inferir modalidad de importes o datos personales.';
