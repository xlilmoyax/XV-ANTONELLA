-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0003 · RPC atómica registrar_rsvp (con modalidades)
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
-- Requiere: aprobación explícita + 0006 aplicada ANTES (usa modalidades) +
--   ajuste del formulario para llamar a supabase.rpc('registrar_rsvp', {payload}).
--
-- PROBLEMA QUE RESUELVE:
--   Con RLS por tabla, el anónimo puede insertar un attendee apuntando a
--   CUALQUIER guest_id (la FK garantiza existencia, no autorización).
--   Esta RPC elimina el hueco: los ids se generan en servidor, el importe
--   se recalcula desde (edades, regla, precio de la modalidad) y
--   guest+attendees se insertan en una sola transacción.
--
-- MODALIDADES (diseño etapa 1):
--   - `modalidad` es OBLIGATORIA en el payload ('familiares'|'companeros').
--     Sin ella no hay registro (nunca default silencioso).
--   - Precio, regla de edad y permiso de acompañantes se leen de
--     `modalidades` (fuente confiable); se IGNORA cualquier importe del cliente.
--   - B (`companeros`): registro individual — total exacto 1 persona,
--     acompañantes rechazados aunque se manipule la petición; sin exención
--     (regla NULL = todos abonan); A conserva todas sus reglas.
--   - Convivencia con fallback directo: tras 0006, el INSERT directo solo
--     admite modalidad familiares; B NO tiene fallback (no existe fallback
--     capaz de validarla). Ventana segura: el frontend B se publica SOLO con
--     0003+0006 aplicadas; antes, B no tiene vía de escritura y no se publica.
--
-- PERMISOS:
--   - SECURITY DEFINER + search_path fijo; valida todo; sin SQL dinámico.
--   - REVOKE ALL + GRANT EXECUTE a anon/authenticated.
--   - NUNCA toma del payload: id, modalidad distinta de las válidas,
--     estado_pago, asistencia interna, timestamps, importe, debe_abonar,
--     guest_id ajeno. 'pago_verificado' solo admin/edge.
--   - Límites: sin rate-limit DB (UNIQUE(email, modalidad_id) por tarjeta;
--     oráculo de email aceptado como en el formulario actual).
--   - Supuestos: modalidades con filas activas (seed 0006); 'asiste' ausente
--     = no_asistira. Auditoría: parseos protegidos, validación pre-insert,
--     duplicado → motivo amable (por tarjeta).
--
-- ROLLBACK: drop function if exists registrar_rsvp(jsonb);
-- ============================================================

create or replace function registrar_rsvp(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modalidad text := lower(btrim(payload ->> 'modalidad'));
  v_mod_id uuid;
  v_precio int;
  v_regla int;
  v_acomp_ok boolean;
  v_nombre text := btrim(payload ->> 'nombre_apellido');
  v_email text := lower(btrim(payload ->> 'email'));
  v_tel text := nullif(btrim(payload ->> 'telefono'), '');
  v_asiste boolean := false;
  v_familia text := nullif(btrim(payload ->> 'familia'), '');
  v_adultos int := 0;
  v_menores int := 0;
  v_edad_tit_txt text := nullif(btrim(payload ->> 'edad_titular'), '');
  v_edad_tit int := null;
  v_acomp jsonb := coalesce(payload -> 'acompanantes', '[]'::jsonb);
  v_restr text := nullif(btrim(payload ->> 'restricciones'), '');
  v_obs text := nullif(btrim(payload ->> 'observaciones'), '');
  v_total int := 0;
  v_n int := 0;
  v_importe int := 0;
  v_asistencia text;
  v_estado text;
  v_guest uuid := gen_random_uuid();
  a jsonb;
  v_edad int;
  v_nom text;
begin
  -- Modalidad válida y activa (obligatoria, sin default).
  if v_modalidad is null or v_modalidad not in ('familiares', 'companeros') then
    return jsonb_build_object('ok', false, 'motivo', 'modalidad');
  end if;
  select id, precio_tarjeta, edad_minima_paga, permite_acompanantes
    into v_mod_id, v_precio, v_regla, v_acomp_ok
  from modalidades where codigo = v_modalidad and activa;
  if v_mod_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'modalidad');
  end if;

  begin
    if payload ? 'asiste' and payload ->> 'asiste' is not null then
      v_asiste := (payload ->> 'asiste')::boolean;
    end if;
    v_adultos := coalesce((payload ->> 'adultos')::int, 0);
    v_menores := coalesce((payload ->> 'menores')::int, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', 'cantidades');
  end;

  if v_nombre is null or char_length(v_nombre) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nombre');
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    return jsonb_build_object('ok', false, 'motivo', 'email');
  end if;

  if v_asiste then
    v_asistencia := 'confirmado';
    v_total := v_adultos + v_menores;
    if v_adultos < 0 or v_menores < 0 or v_total < 1 or v_total > 40 then
      return jsonb_build_object('ok', false, 'motivo', 'cantidades');
    end if;
    -- Compañeros: registro individual exacto (total 1; el chequeo de
    -- longitud del array ya exige 0 acompañantes en ese caso).
    if not v_acomp_ok and v_total <> 1 then
      return jsonb_build_object('ok', false, 'motivo', 'cantidades');
    end if;
    if jsonb_typeof(v_acomp) <> 'array' or jsonb_array_length(v_acomp) <> v_total - 1 then
      return jsonb_build_object('ok', false, 'motivo', 'detalle');
    end if;
  else
    v_asistencia := 'no_asistira';
    v_adultos := 0;
    v_menores := 0;
  end if;

  if v_edad_tit_txt is not null then
    begin
      v_edad_tit := v_edad_tit_txt::int;
    exception when others then
      return jsonb_build_object('ok', false, 'motivo', 'edad');
    end;
    if v_edad_tit < 0 or v_edad_tit > 120 then
      return jsonb_build_object('ok', false, 'motivo', 'edad');
    end if;
  end if;

  -- Recálculo servidor. Regla NULL (B) = todos abonan (null-safe a propósito).
  if v_asiste then
    if v_edad_tit is null or v_regla is null or v_edad_tit >= v_regla then
      v_n := v_n + 1;
    end if;
    for a in select * from jsonb_array_elements(v_acomp) loop
      v_nom := btrim(a ->> 'nombre');
      if v_nom is null or char_length(v_nom) < 2 then
        return jsonb_build_object('ok', false, 'motivo', 'detalle');
      end if;
      begin
        v_edad := (a ->> 'edad')::int;
      exception when others then
        return jsonb_build_object('ok', false, 'motivo', 'detalle');
      end;
      if v_edad is null or v_edad < 0 or v_edad > 120 then
        return jsonb_build_object('ok', false, 'motivo', 'detalle');
      end if;
      if v_regla is null or v_edad >= v_regla then
        v_n := v_n + 1;
      end if;
    end loop;
  end if;

  v_importe := v_n * v_precio;
  if (not v_asiste) or v_n = 0 then
    v_estado := 'no_corresponde';
  else
    v_estado := 'pendiente_pago';
  end if;

  begin
    insert into guests (id, modalidad_id, nombre_apellido, email, telefono,
      asistencia, apellido_familiar, cantidad_adultos, cantidad_menores,
      restricciones, observaciones, importe_estimado, estado_pago)
    values (v_guest, v_mod_id, v_nombre, v_email, v_tel,
      v_asistencia, v_familia, v_adultos, v_menores,
      v_restr, v_obs, v_importe, v_estado);

    if v_asiste then
      insert into attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
      values (v_guest, v_nombre, v_edad_tit, true,
        (v_edad_tit is null or v_regla is null or v_edad_tit >= v_regla));
      for a in select * from jsonb_array_elements(v_acomp) loop
        v_nom := btrim(a ->> 'nombre');
        v_edad := (a ->> 'edad')::int;
        insert into attendees (guest_id, nombre, edad_al_evento, es_titular, debe_abonar)
        values (v_guest, v_nom, v_edad, false, (v_regla is null or v_edad >= v_regla));
      end loop;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'duplicado');
  end;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest, 'modalidad', v_modalidad,
    'importe', v_importe, 'que_abonan', v_n, 'total', v_total
  );
end;
$$;

revoke all on function registrar_rsvp(jsonb) from public, anon, authenticated;
grant execute on function registrar_rsvp(jsonb) to anon, authenticated;
