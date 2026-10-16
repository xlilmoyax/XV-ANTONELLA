-- Ejecutar solo contra una base local con migraciones 0001-0003 aplicadas.
-- Abrir transacción para revertir registros y usuarios de prueba.
begin;

do $$
declare
  v_result jsonb;
  v_actor uuid := gen_random_uuid();
  v_no_admin uuid := gen_random_uuid();
  v_familia_inv uuid := gen_random_uuid();
  v_companeros_inv uuid := gen_random_uuid();
  v_duplicado_inv uuid := gen_random_uuid();
  v_guest uuid;
  v_email text;
  v_clave text := 'prueba-idempotencia-' || gen_random_uuid()::text;
begin
  if has_schema_privilege('anon', 'public', 'create')
    or has_schema_privilege('authenticated', 'public', 'create') then
    raise exception 'Los roles públicos no deben crear objetos en public';
  end if;

  if not exists (
    select 1 from public.modalidades
    where codigo = 'familia_amigos' and precio_tarjeta = 70000
      and edad_minima_paga = 10 and permite_acompanantes
      and hora_inicio = '21:00' and hora_fin = '05:00'
  ) or not exists (
    select 1 from public.modalidades
    where codigo = 'companeros' and precio_tarjeta = 40000
      and edad_minima_paga is null and not permite_acompanantes
      and hora_inicio = '21:00' and hora_fin = '02:00'
  ) then
    raise exception 'El catálogo no coincide con las reglas canónicas';
  end if;

  if has_table_privilege('anon', 'public.modalidades', 'select')
    or has_table_privilege('anon', 'public.event_settings', 'select')
    or has_table_privilege('anon', 'public.content_sections', 'select')
    or has_table_privilege('anon', 'public.gallery_images', 'select')
    or has_table_privilege('anon', 'public.guests', 'select')
    or has_table_privilege('anon', 'public.attendees', 'select')
    or has_table_privilege('anon', 'public.payment_records', 'select')
    or has_table_privilege('anon', 'public.guests', 'insert')
    or has_table_privilege('anon', 'public.attendees', 'insert') then
    raise exception 'anon conserva permisos directos sobre datos o configuración';
  end if;

  if has_function_privilege('anon', 'public.registrar_rsvp(uuid,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.registrar_rsvp(uuid,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.registrar_rsvp(uuid,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.registrar_aviso_pago(text)', 'execute')
    or has_function_privilege('authenticated', 'public.registrar_aviso_pago(text)', 'execute')
    or not has_function_privilege('service_role', 'public.registrar_aviso_pago(text)', 'execute') then
    raise exception 'Privilegios de funciones protegidas incorrectos';
  end if;

  if not (
    select relrowsecurity from pg_class
    where oid = 'public.modalidades'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid = 'public.invitaciones'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid = 'public.guests'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid = 'public.attendees'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid = 'public.payment_records'::regclass
  ) then
    raise exception 'RLS debe estar habilitado en las tablas protegidas';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('event_settings', 'content_sections', 'gallery_images')
      and policyname in ('ev_read', 'cs_read', 'gal_read')
  ) then
    raise exception 'Quedó activa una política de lectura pública de configuración';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('guests', 'attendees')
      and policyname in ('g_insert', 'a_insert')
  ) then
    raise exception 'Quedó activa una política de inserción pública directa';
  end if;

  insert into public.email_logs (tipo, destinatario, asunto, idempotencia_clave)
  values ('prueba', 'test@example.test', 'prueba', v_clave);
  begin
    insert into public.email_logs (tipo, destinatario, asunto, idempotencia_clave)
    values ('prueba', 'test@example.test', 'duplicado', v_clave);
    raise exception 'Se aceptó una clave de idempotencia duplicada';
  exception when unique_violation then
    null;
  end;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_actor, 'authenticated', 'authenticated',
    'invitation-test-' || v_actor::text || '@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  create temporary table admin_profiles (user_id uuid, activo boolean);
  insert into pg_temp.admin_profiles values (v_actor, true);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  if public.xv_es_admin() then
    raise exception 'xv_es_admin permitió suplantar admin_profiles desde pg_temp';
  end if;

  insert into public.invitaciones (id, modalidad_id, created_by, expires_at)
  select v_familia_inv, id, v_actor, now() + interval '1 day'
  from public.modalidades where codigo = 'familia_amigos';

  v_email := 'modalidad-' || gen_random_uuid()::text || '@example.test';
  v_result := public.registrar_rsvp(v_familia_inv, jsonb_build_object(
    'modalidad', 'companeros',
    'nombre_apellido', 'Prueba Familia',
    'email', v_email,
    'asiste', true,
    'adultos', 2,
    'menores', 1,
    'edad_titular', '35',
    'importe_estimado', 1,
    'acompanantes', jsonb_build_array(
      jsonb_build_object('nombre', 'Menor de prueba', 'edad', '9'),
      jsonb_build_object('nombre', 'Persona de 10', 'edad', '10')
    )
  ));
  if v_result ->> 'ok' <> 'true'
    or v_result ->> 'modalidad' <> 'familia_amigos'
    or (v_result ->> 'importe')::integer <> 140000 then
    raise exception 'Familia: se esperaba cálculo servidor 140000 independiente del payload; respuesta=%', v_result;
  end if;

  v_guest := (v_result ->> 'guest_id')::uuid;
  if not exists (
    select 1 from public.guests g
    join public.modalidades m on m.id = g.modalidad_id
    where g.id = v_guest and m.codigo = 'familia_amigos' and g.importe_estimado = 140000
  ) then
    raise exception 'Familia: no se persistió modalidad e importe calculado';
  end if;

  insert into public.invitaciones (id, modalidad_id, created_by, expires_at)
  select v_duplicado_inv, id, v_actor, now() + interval '1 day'
  from public.modalidades where codigo = 'familia_amigos';
  v_result := public.registrar_rsvp(v_duplicado_inv, jsonb_build_object(
    'nombre_apellido', 'Correo duplicado',
    'email', v_email,
    'asiste', true,
    'adultos', 1,
    'menores', 0,
    'edad_titular', '30',
    'acompanantes', '[]'::jsonb
  ));
  if v_result ->> 'ok' <> 'false'
    or v_result ->> 'motivo' <> 'duplicado'
    or (select used_at from public.invitaciones where id = v_duplicado_inv) is not null
    or (select count(*) from public.guests where email = v_email) <> 1 then
    raise exception 'Un email duplicado debe rechazarse sin consumir la invitación ni crear registros';
  end if;

  v_result := public.registrar_rsvp(v_familia_inv, jsonb_build_object(
    'nombre_apellido', 'Reintento',
    'email', 'retry-' || gen_random_uuid()::text || '@example.test',
    'asiste', true,
    'adultos', 1,
    'menores', 0,
    'edad_titular', '30',
    'acompanantes', '[]'::jsonb
  ));
  if v_result ->> 'ok' <> 'false' or v_result ->> 'motivo' <> 'invitacion' then
    raise exception 'La invitación consumida aceptó un segundo registro: respuesta=%', v_result;
  end if;

  insert into public.invitaciones (id, modalidad_id, created_by, expires_at)
  select v_companeros_inv, id, v_actor, now() + interval '1 day'
  from public.modalidades where codigo = 'companeros';

  v_result := public.registrar_rsvp(v_companeros_inv, jsonb_build_object(
    'nombre_apellido', 'Prueba Compañero Inválido',
    'email', 'modalidad-' || gen_random_uuid()::text || '@example.test',
    'asiste', true,
    'adultos', 1,
    'menores', 1,
    'edad_titular', '30',
    'acompanantes', jsonb_build_array(jsonb_build_object('nombre', 'Acompañante', 'edad', '20'))
  ));
  if v_result ->> 'ok' <> 'false' or v_result ->> 'motivo' <> 'detalle' then
    raise exception 'Compañeros debe rechazar acompañantes; respuesta=%', v_result;
  end if;

  v_result := public.registrar_rsvp(v_companeros_inv, jsonb_build_object(
    'modalidad', 'familia_amigos',
    'nombre_apellido', 'Prueba Compañero',
    'email', 'modalidad-' || gen_random_uuid()::text || '@example.test',
    'asiste', true,
    'adultos', 0,
    'menores', 1,
    'edad_titular', '8',
    'importe_estimado', 0,
    'acompanantes', '[]'::jsonb
  ));
  if v_result ->> 'ok' <> 'true'
    or v_result ->> 'modalidad' <> 'companeros'
    or (v_result ->> 'importe')::integer <> 40000 then
    raise exception 'Compañeros debe cobrar sin exención; respuesta=%', v_result;
  end if;

  perform set_config('request.jwt.claim.sub', v_no_admin::text, true);
  execute 'set local role anon';
  begin
    execute 'select count(*)::text from public.guests' into v_email;
    if v_email <> '0' then raise exception 'anon pudo leer invitados'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*)::text from public.attendees' into v_email;
    if v_email <> '0' then raise exception 'anon pudo leer acompañantes'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*)::text from public.modalidades' into v_email;
    if v_email <> '0' then raise exception 'anon pudo leer el catálogo'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*)::text from public.payment_records' into v_email;
    if v_email <> '0' then raise exception 'anon pudo leer pagos'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*)::text from public.email_logs' into v_email;
    if v_email <> '0' then raise exception 'anon pudo leer registros de correo'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.guests (nombre_apellido, email)
    values ('Usuario público', 'anon-test@example.test');
    raise exception 'anon pudo insertar invitados directamente';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_no_admin::text, true);
  execute 'set local role authenticated';
  if public.xv_es_admin()
    or (select count(*) from public.guests) <> 0
    or (select count(*) from public.modalidades) <> 0
    or (select count(*) from public.payment_records) <> 0
    or (select count(*) from public.email_logs) <> 0 then
    raise exception 'Un usuario autenticado sin perfil admin accedió a datos privados';
  end if;
  execute 'reset role';

  insert into public.admin_profiles (user_id, email, activo)
  values (v_actor, 'admin-test@example.test', true);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  execute 'set local role authenticated';
  if not public.xv_es_admin()
    or (select count(*) from public.guests) < 2
    or (select count(*) from public.modalidades) <> 2 then
    raise exception 'El administrador autorizado no pudo consultar ambas modalidades y registros';
  end if;
  execute 'reset role';
end
$$;

rollback;
