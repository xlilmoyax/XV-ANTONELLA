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

alter table modalidades enable row level security;
create policy mod_read on modalidades for select using (true);
create policy mod_admin on modalidades
  for all using (xv_es_admin()) with check (xv_es_admin());
revoke insert, update, delete on modalidades from anon, authenticated;
grant select on modalidades to anon, authenticated;

create trigger t_modalidades before update on modalidades
  for each row execute function xv_touch_updated_at();

-- All public RSVP writes go through the atomic SECURITY DEFINER RPC below.
-- Removing these policies closes direct guest/attendee insertion paths.
drop policy if exists g_insert on guests;
drop policy if exists a_insert on attendees;

create or replace function registrar_rsvp(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := payload ->> 'modalidad';
  v_modalidad_id uuid;
  v_precio integer;
  v_edad_minima integer;
  v_permite_acompanantes boolean;
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
  if jsonb_typeof(payload) <> 'object'
     or v_codigo not in ('familia_amigos', 'companeros') then
    return jsonb_build_object('ok', false, 'motivo', 'modalidad');
  end if;

  select id, precio_tarjeta, edad_minima_paga, permite_acompanantes
    into v_modalidad_id, v_precio, v_edad_minima, v_permite_acompanantes
  from modalidades
  where codigo = v_codigo and activa;
  if v_modalidad_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'modalidad');
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
    insert into guests (
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
      insert into attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
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
        insert into attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
        values (
          v_guest_id, v_nombre_persona, v_edad_persona, false,
          case when v_codigo = 'companeros' then true
               else v_edad_persona >= v_edad_minima end
        );
      end loop;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest_id, 'modalidad', v_codigo,
    'importe', v_importe, 'que_abonan', v_personas_que_abonan, 'total', v_total
  );
end;
$$;

revoke all on function registrar_rsvp(jsonb) from public, anon, authenticated;
grant execute on function registrar_rsvp(jsonb) to anon, authenticated;

comment on column guests.modalidad_id is
  'NULL hasta clasificación manual; no inferir modalidad de importes o datos personales.';
