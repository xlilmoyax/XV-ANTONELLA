-- ============================================================
-- XV-ANTONELLA · Migración 0002 · Habilitar INSERT público RSVP
-- Estado: PROPUESTA — NO aplicada. Requiere aprobación explícita.
-- Aplicar con: npx supabase db push   (desde la carpeta XV-ANTONELLA)
--
-- PROBLEMA (verificado en vivo, test T7 → 401/42501):
--   El INSERT anónimo en guests/attendees es rechazado aunque existe
--   g_insert/a_insert con WITH CHECK (true).
--
-- CAUSA (definiciones reales confirmadas en pg_policies):
--   guests:    g_insert  (INSERT, PERMISSIVE, roles {public}, WITH CHECK true)
--              g_admin   (ALL,    PERMISSIVE, roles {public}, USING + WITH CHECK xv_es_admin())
--   attendees: a_insert / a_admin con la misma estructura.
--   En PostgreSQL, para INSERT/UPDATE la fila nueva debe satisfacer el
--   WITH CHECK de TODAS las políticas aplicables (se combinan con AND),
--   mientras que los USING de SELECT se combinan con OR entre políticas
--   permisivas. Para anónimo: AND(true, xv_es_admin()=false) → 42501.
--   Evidencia consistente: SELECT/UPDATE/DELETE anónimos → 0 filas
--   (USING con OR); INSERT admin por canal verificado → OK
--   (AND true,true); INSERT anónimo → 42501.
--
-- FIX:
--   La política admin deja de cubrir INSERT. El INSERT queda gobernado
--   SOLO por g_insert/a_insert. SELECT/UPDATE/DELETE siguen solo-admin.
--   Además se endurece g_insert para que el cliente NO pueda falsificar
--   estados de pago/asistencia, timestamps internos, cabezas absurdas ni
--   importes incoherentes al insertar (ver punto SEGURIDAD).
--
-- SEGURIDAD (sin cambios respecto a 0001, salvo lo indicado):
--   - Anónimo sigue SIN SELECT/UPDATE/DELETE en guests/attendees.
--   - Anónimo sigue SIN acceso a payment_records, email_logs,
--     admin_profiles, grupos, plantillas, auditoría, versiones.
--   - g_insert endurecido (auditoría columna por columna en la revisión):
--       * asistencia solo 'confirmado'/'no_asistira' (lo que emite el form).
--       * estado_pago solo 'no_corresponde'/'pendiente_pago'. Insertar
--         'pago_informado'/'pago_verificado'/'requiere_revision' → 42501.
--       * pago_informado_at y pago_verificado_at deben ser NULL: solo
--         admin/edge los escriben vía UPDATE. (created_at/updated_at tienen
--         DEFAULT now(), por eso no se les exige NULL: el default ya los
--         completa antes del WITH CHECK.)
--       * coherencia: no_asistira exige 0/0/$0; confirmado exige total
--         entre 1 y 40 (máximo del formulario: 20+20) y
--         (no_corresponde+$0 | pendiente_pago+$>0). Supone precio>0
--         (hoy $70.000); si el evento fuera gratuito, revisar esta regla.
--       * El importe EXACTO sigue siendo "estimado": la verdad de pago es
--         la verificación manual del admin contra la transferencia, no este
--         campo. El check impide incoherencias groseras, no mentiras finas.
--   - 'pago_verificado' solo lo escribe el admin (panel) o la Edge
--     Function con service_role: el cliente no puede auto-verificarse.
--   - Acompañantes (a_insert SIN cambios: attendees no tiene columnas de
--     estados/pagos/privilegios; edad>=0 ya lo exige un CHECK; la FK y la
--     cascada quedan intactas). Riesgo residual documentado abajo.
--
-- REQUISITO DE APP (cambio mínimo, debe salir JUNTO con esta migración):
--   El anónimo no tiene SELECT, por lo que POST guests con
--   return=representation devuelve 201+[] y el .single() del formulario
--   fallaría aunque la fila se haya creado. RsvpForm debe generar el id
--   del invitado en el cliente (crypto.randomUUID()), incluirlo en el
--   INSERT y no esperar retorno, para luego insertar los attendees con
--   ese id. Sin este ajuste, 0002 deja filas huérfanas (guest sin detalle).
--
-- RECOMENDACIÓN POSTERIOR (no incluida, requiere aprobación):
--   RPC SECURITY DEFINER registrar_rsvp(payload): inserta guest+attendees
--   en una sola llamada atómica, valida todo en servidor, recalcula el
--   importe desde (edades, regla, precio) y elimina el hueco de autorización
--   de guest_id descrito abajo.
--
-- RIESGOS:
--   - Solo DDL (DROP/CREATE POLICY). Cero cambios de datos.
--   - Transaccional: si algo falla, db push revierte todo.
--   - Re-ejecución segura: IF EXISTS + nombres nuevos (idempotente).
--   - ROLLBACK manual al final del archivo (no borra datos).
-- ============================================================

-- ---------- guests: admin sin INSERT ----------
drop policy if exists g_admin on guests;

create policy g_admin_select on guests
  for select using (xv_es_admin());

create policy g_admin_update on guests
  for update using (xv_es_admin()) with check (xv_es_admin());

create policy g_admin_delete on guests
  for delete using (xv_es_admin());

-- ---------- guests: INSERT público endurecido (anti-falsificación) ----------
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

-- ---------- attendees: admin sin INSERT ----------
drop policy if exists a_admin on attendees;

create policy a_admin_select on attendees
  for select using (xv_es_admin());

create policy a_admin_update on attendees
  for update using (xv_es_admin()) with check (xv_es_admin());

create policy a_admin_delete on attendees
  for delete using (xv_es_admin());

-- a_insert se conserva tal cual (WITH CHECK true): los campos del
-- acompañante (nombre/edad/flags) varían legítimamente y la verificación
-- de pagos es potestad del admin, no de estos flags.

-- ============================================================
-- ROLLBACK MANUAL (solo si 0002 trae problemas; no borra datos).
-- Vuelve al estado 0001: admin total, INSERT público bloqueado.
--   drop policy if exists g_admin_select on guests;
--   drop policy if exists g_admin_update on guests;
--   drop policy if exists g_admin_delete on guests;
--   drop policy if exists g_insert on guests;
--   drop policy if exists a_admin_select on attendees;
--   drop policy if exists a_admin_update on attendees;
--   drop policy if exists a_admin_delete on attendees;
--   create policy g_admin on guests for all
--     using (xv_es_admin()) with check (xv_es_admin());
--   create policy g_insert on guests for insert with check (true);
--   create policy a_admin on attendees for all
--     using (xv_es_admin()) with check (xv_es_admin());
--   create policy a_insert on attendees for insert with check (true);
-- ============================================================
