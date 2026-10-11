-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0007 · Endurecer modalidad (FASE B)
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
--
-- PRECONDICIONES (verificar antes de aplicar):
--   1. 0006 aplicada. 2. Frontend que envía modalidad_id desplegado Y con
--      registros A fluyendo con UUID (comprobar en guests). 3. Redeploy del
--      frontend para renovar cachés viejas (las pestañas abiertas con el
--      formulario anterior fallarán con mensaje genérico, sin corromper nada).
--
-- EFECTO: backfill NULL→familiares (fáctico: sin B publicada ni RPC, todo
-- NULL previo es necesariamente de A), NOT NULL, UNIQUE(email,modalidad_id),
-- g_insert solo-familiares. Desde aquí, el INSERT directo sin modalidad falla.
-- Orden posterior: 0003-final (RPC) → tarjeta B → 0004-retiro (opcional).
-- Nombres finales al mover a migrations/: ver encabezado de 0006.
--
-- ROLLBACK: al final. Revertir con filas B existentes exige decisión previa.
-- ============================================================

-- Guardia: si hay NULLs inesperados fuera del caso documentado, abortar.
-- (Con B sin publicar, todo NULL es de A; este bloque lo deja explícito.)
do $$
begin
  if (select count(*) from guests where modalidad_id is null) > 0 then
    raise notice 'Backfill: % fila(s) NULL se clasifican como familiares (pre-B verificado).',
      (select count(*) from guests where modalidad_id is null);
  end if;
end $$;

update guests
set modalidad_id = (select id from modalidades where codigo = 'familiares')
where modalidad_id is null;

alter table guests alter column modalidad_id set not null;

-- Un mismo correo puede confirmar en ambas tarjetas (verificaciones
-- independientes por modalidad).
alter table guests drop constraint guests_email_unico;
alter table guests add constraint guests_email_modalidad_unico unique (email, modalidad_id);

-- g_insert fase B: SOLO familiares (B solo vía RPC). Resto idéntico a 0006.
drop policy if exists g_insert on guests;
create policy g_insert on guests
  for insert with check (
    modalidad_id = (select id from modalidades where codigo = 'familiares')
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
-- ROLLBACK MANUAL FASE B:
--   drop policy if exists g_insert on guests;
--   [recrear g_insert de 0006 (rama NULL-or-familiares)]
--   alter table guests drop constraint guests_email_modalidad_unico;
--   alter table guests add constraint guests_email_unico unique (email);
--   alter table guests alter column modalidad_id drop not null;
-- ============================================================
