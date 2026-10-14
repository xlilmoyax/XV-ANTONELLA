-- Ejecutar solo contra una base local con migraciones 0001–0003 aplicadas.
-- Abrir transacción para revertir las inscripciones de prueba.
begin;

do $$
declare
  v_result jsonb;
  v_email text;
  v_guest uuid;
  v_clave text := 'prueba-idempotencia-' || gen_random_uuid()::text;
begin
  if not exists (
    select 1 from modalidades
    where codigo = 'familia_amigos' and precio_tarjeta = 70000
      and edad_minima_paga = 10 and permite_acompanantes
      and hora_inicio = '21:00' and hora_fin = '05:00'
  ) or not exists (
    select 1 from modalidades
    where codigo = 'companeros' and precio_tarjeta = 40000
      and edad_minima_paga is null and not permite_acompanantes
      and hora_inicio = '21:00' and hora_fin = '02:00'
  ) then
    raise exception 'El catálogo no coincide con las reglas canónicas';
  end if;

  insert into email_logs (tipo, destinatario, asunto, idempotencia_clave)
  values ('prueba', 'test@example.test', 'prueba', v_clave);
  begin
    insert into email_logs (tipo, destinatario, asunto, idempotencia_clave)
    values ('prueba', 'test@example.test', 'duplicado', v_clave);
    raise exception 'Se aceptó una clave de idempotencia duplicada';
  exception when unique_violation then
    null;
  end;

  v_email := 'modalidad-' || gen_random_uuid()::text || '@example.test';
  v_result := registrar_rsvp(jsonb_build_object(
    'modalidad', 'familia_amigos',
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
  if v_result ->> 'ok' <> 'true' or (v_result ->> 'importe')::integer <> 140000 then
    raise exception 'Familia: se esperaba cálculo 140000 independiente del importe cliente; respuesta=%', v_result;
  end if;

  v_guest := (v_result ->> 'guest_id')::uuid;
  if not exists (
    select 1 from guests g
    join modalidades m on m.id = g.modalidad_id
    where g.id = v_guest and m.codigo = 'familia_amigos' and g.importe_estimado = 140000
  ) then
    raise exception 'Familia: no se persistió modalidad e importe calculado';
  end if;

  v_result := registrar_rsvp(jsonb_build_object(
    'modalidad', 'companeros',
    'nombre_apellido', 'Prueba Compañero',
    'email', 'modalidad-' || gen_random_uuid()::text || '@example.test',
    'asiste', true,
    'adultos', 0,
    'menores', 1,
    'edad_titular', '8',
    'importe_estimado', 0,
    'acompanantes', '[]'::jsonb
  ));
  if v_result ->> 'ok' <> 'true' or (v_result ->> 'importe')::integer <> 40000 then
    raise exception 'Compañeros: edad no debe generar exención; respuesta=%', v_result;
  end if;

  v_result := registrar_rsvp(jsonb_build_object(
    'modalidad', 'companeros',
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

  v_result := registrar_rsvp(jsonb_build_object(
    'modalidad', 'no_clasificada',
    'nombre_apellido', 'Prueba Sin Modalidad',
    'email', 'modalidad-' || gen_random_uuid()::text || '@example.test'
  ));
  if v_result ->> 'ok' <> 'false' or v_result ->> 'motivo' <> 'modalidad' then
    raise exception 'Modalidad desconocida debe rechazarse; respuesta=%', v_result;
  end if;
end
$$;

rollback;
