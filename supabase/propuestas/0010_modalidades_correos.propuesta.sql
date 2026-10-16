-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0010 · Modalidades para correos (GAS por tarjeta)
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
--
-- OBJETIVO: que Google Apps Script envíe bienvenidas y recordatorios a la
-- modalidad correcta sin mezclar Familiares (A) con Compañeros (B).
-- ALCANCE (solo correos; no reescribe 0006/0007, no las renumera):
--   - Crea `modalidades` + seed A/B (idempotente; si 0006 ya la creó, la
--     reutiliza: verificar forma con la consulta POST-3).
--   - Agrega guests.modalidad_id NULLABLE (sin backfill: NULL = pendiente de
--     clasificación, nunca se adivina por precio/apellido/grupo/correo).
--   - Agrega email_templates.modalidad_id + email_logs.modalidad_id.
--   - NO toca g_insert ni ninguna policy existente (RLS intacto); NO impone
--     NOT NULL ni UNIQUE nuevos (eso es 0008-fase-B / futuro, ver NOTA-0007).
-- COMPATIBILIDAD: aplicable ANTES o DESPUÉS de 0006 (guardas IF NOT EXISTS).
--   Orden recomendado para el objetivo correos: 0010 → clasificar → GAS-compat.
--   0006/0007 siguen pendientes para el flujo de registro B (otra vía).
--
-- PRE-CHECKS (ejecutar antes; abortar si fallan):
--   P1. select to_regclass('public.guests'), to_regclass('public.email_templates'),
--       to_regclass('public.email_logs'); -- las 3 deben existir (0001 aplicado)
--   P2. Si existe public.modalidades, verificar forma y ANOTAR preexistencia
--       (rige el rollback R0/R4: lo preexistente no se dropea):
--       select column_name from information_schema.columns
--       where table_name = 'modalidades'; -- debe incluir codigo/precio_tarjeta
--   P3. Anotar si guests/email_templates/email_logs ya traen modalidad_id y
--       si existen policies mod_*/trigger t_modalidades (rige R0/R3):
--       select count(*) from guests where modalidad_id is null
--       -- (falla si la columna no existe: es lo esperado pre-0010).
--
-- NOTA-0007: 0007 hace backfill NULL→familiares + NOT NULL. Su supuesto ("sin
--   B publicada, todo NULL es de A") solo vale si se aplica ANTES de que exista
--   cualquier vía de escritura B. Para correos NO se necesita: 0010 deja NULL
--   como pendiente bloqueante (el GAS-compat jamás envía a NULL). NO aplicar
--   0007 hasta clasificar (ver CLASIFICACIÓN) y verificar POST-N1 = 0.
-- ============================================================

-- ---------- 1. tabla modalidades (reutiliza la de 0006 si ya existe) ----------
create table if not exists modalidades (
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
  -- NULL = sin exención por edad (B: todos abonan).
  edad_minima_paga integer check (edad_minima_paga is null or edad_minima_paga >= 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed idempotente (mismos valores aprobados que 0006; no pisa existentes).
insert into modalidades (
  codigo, nombre, precio_tarjeta, hora_inicio, hora_fin, fecha_fin,
  fecha_limite_confirmacion, fecha_limite_pago, vestimenta,
  permite_acompanantes, edad_minima_paga, activa
) values
  ('familiares', 'Familiares y amigos', 70000, '21:00', '05:00', '2026-12-20',
   '2026-11-25', '2026-12-10', 'Formal', true, 10, true),
  ('companeros', 'Compañeros', 40000, '21:00', '02:00', '2026-12-20',
   '2026-11-25', '2026-12-10', 'Formal', false, null, true)
on conflict (codigo) do nothing;

-- ---------- 2. guests.modalidad_id NULLABLE (sin backfill) ----------
alter table guests add column if not exists modalidad_id uuid references modalidades (id);
create index if not exists guests_modalidad_idx on guests (modalidad_id);

-- ---------- 3. email_templates.modalidad_id ----------
alter table email_templates add column if not exists modalidad_id uuid references modalidades (id);
create index if not exists templates_modalidad_idx on email_templates (modalidad_id);

-- ---------- 4. email_logs.modalidad_id (auditoría del envío) ----------
alter table email_logs add column if not exists modalidad_id uuid references modalidades (id);
create index if not exists email_logs_modalidad_idx on email_logs (modalidad_id);

-- ---------- 5. RLS: solo modalidades (lectura pública como event_settings) ----------
-- Se INSPECCIONA antes de crear: comando, roles, permisiva/restrictiva, USING
-- y WITH CHECK. Jamás se dropea ni se reemplaza una policy preexistente cuya
-- equivalencia no esté demostrada: ante cualquier diferencia se conserva y se
-- avisa por NOTICE (decisión manual, fuera de la propuesta).
alter table modalidades enable row level security;
do $$
declare
  r_read record;
  r_admin record;
begin
  select cmd, roles::text as roles, permissive, qual, with_check into r_read
  from pg_policies
  where schemaname = 'public' and tablename = 'modalidades' and policyname = 'mod_read';
  if not found then
    create policy mod_read on modalidades for select using (true);
  elsif r_read.cmd is distinct from 'SELECT'
     or r_read.roles is distinct from '{public}'
     or r_read.permissive is distinct from true
     or r_read.qual is distinct from '(true)'
     or r_read.with_check is not null then
    raise notice 'mod_read preexistente NO equivalente (comando/roles/permisiva/USING/WITH CHECK difieren): se conserva. Revisar a mano.';
  end if;
  select cmd, roles::text as roles, permissive, qual, with_check into r_admin
  from pg_policies
  where schemaname = 'public' and tablename = 'modalidades' and policyname = 'mod_admin';
  if not found then
    create policy mod_admin on modalidades
      for all using (xv_es_admin()) with check (xv_es_admin());
  elsif r_admin.cmd is distinct from 'ALL'
     or r_admin.roles is distinct from '{public}'
     or r_admin.permissive is distinct from true
     or r_admin.qual is distinct from '(xv_es_admin())'
     or r_admin.with_check is distinct from '(xv_es_admin())' then
    raise notice 'mod_admin preexistente NO equivalente (comando/roles/permisiva/USING/WITH CHECK difieren): se conserva. Revisar a mano.';
  end if;
end $$;
-- (g_insert, et_admin, el_admin y demás policies: SIN CAMBIOS.)

-- updated_at: 0001 provee xv_touch_updated_at. Se verifica TABLA y FUNCIÓN
-- asociadas (no solo el nombre): un t_modalidades ajeno no se toca.
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where t.tgname = 't_modalidades'
      and c.relnamespace = 'public'::regnamespace
      and c.relname = 'modalidades'
      and p.proname = 'xv_touch_updated_at'
  ) then
    raise notice 'Trigger t_modalidades ya correcto en modalidades: se conserva.';
  elsif exists (select 1 from pg_trigger where tgname = 't_modalidades') then
    raise notice 'Existe t_modalidades en OTRA tabla/función: no se toca. Revisar a mano.';
  else
    create trigger t_modalidades before update on modalidades
      for each row execute function xv_touch_updated_at();
  end if;
end $$;

-- ---------- 6. plantillas: alcance A existente + filas B vacías ----------
-- EVIDENCIA del alcance A: los cuerpos vigentes mencionan $70.000, menores de
-- 10 años y el 10/12/2026 (valores de la modalidad familiares). Verificar:
--   select clave from email_templates
--   where modalidad_id is null and clave in ('agradecimiento','recordatorio_pago');
update email_templates
set modalidad_id = (select id from modalidades where codigo = 'familiares')
where clave in ('agradecimiento', 'recordatorio_pago')
  and modalidad_id is null;

-- Invariante "sufijo ⇒ modalidad": filas *_companeros preexistentes (creadas
-- a mano en el panel) sin asignar quedan bloqueadas por el GAS; se scopean
-- solo si están sin asignar (nunca se pisa una asignación explícita).
update email_templates
set modalidad_id = (select id from modalidades where codigo = 'companeros')
where clave like '%\_companeros'
  and modalidad_id is null;

-- Filas B con cuerpo VACÍO a propósito: el GAS-compat las trata como
-- "plantilla sin correspondencia" y BLOQUEA esos envíos. El contenido B se
-- escribe en el panel (Contenidos/plantillas), nunca se inventa aquí.
-- Token disponible en cuerpos: [Nombre], [Importe], [Enlace] (ver GAS-compat).
insert into email_templates (clave, asunto, cuerpo, modalidad_id) values
  ('agradecimiento_companeros', '¡Gracias por confirmar tu asistencia!',
   '', (select id from modalidades where codigo = 'companeros')),
  ('recordatorio_pago_companeros', 'Recordatorio · Tarjeta Compañeros',
   '', (select id from modalidades where codigo = 'companeros'))
on conflict (clave) do nothing;

-- ---------- POST-CHECKS (ejecutar después; todo debe cumplirse) ----------
--   N1. select count(*) from guests where modalidad_id is null; -- pendientes (>=0; ver CLASIFICACIÓN)
--   N2. select m.codigo, count(g.id) from modalidades m
--       left join guests g on g.modalidad_id = m.id group by 1; -- reparto visible
--   N3. select clave, (select codigo from modalidades where id = modalidad_id) as mod,
--       char_length(cuerpo) as largo from email_templates order by 1;
--       -- 4 filas: 2 A con cuerpo>0, 2 B (cuerpo 0 hasta redactar)
--   N4. Verificar FK e índices: índices guests_modalidad_idx,
--       templates_modalidad_idx, email_logs_modalidad_idx existen.
--
-- ---------- CLASIFICACIÓN de históricos (manual, sin adivinar) ----------
--   C1. Listar pendientes vigentes (únicos candidatos a clasificar):
--       select id, nombre_apellido, email, asistencia, estado_pago, created_at
--       from guests where modalidad_id is null order by created_at;
--   C2. Clasificar SOLO con evidencia (ej.: comprobante/pago/consulta directa):
--       update guests set modalidad_id = (select id from modalidades where codigo = 'familiares')
--       where id in ('<uuid-1>', '<uuid-2>'); -- UUIDs explícitos, de a pocos
--   C3. Re-petir N1 hasta 0. Recién entonces evaluar NOT NULL (propuesta futura;
--       0007 NO debe aplicarse con pendientes: su backfill masivo quedaría
--       prohibido por esta regla).
--   C4. Mientras N1 > 0: prohibido enviar a esos invitados (el GAS-compat los
--       bloquea y los cuenta; no se les escribe ni se les cambia nada).
--
-- ---------- ROLLBACK MANUAL SEGURO ----------
--   Dos clases de frenos, sin confundirlas: AUTOMÁTICOS (bloques DO con raise
--   exception: abortan al ejecutarse) y MANUALES (registros P y verificaciones:
--   el operador los confirma antes de cada paso; nada manual se presenta como
--   bloqueo automático).
--   R0. PRE-ESTADO (anotado en P2/P2b/P2c/P3a/P4/P5 al aplicar: ¿modalidades/
--   columnas/policies/trigger/RLS preexistían?). Si preexistían, NO se dropean:
--   saltar el paso correspondiente. Ante duda, no revertir.
--   R1. RESPALDO obligatorio (el rollback pierde asignaciones y cuerpos B):
--     select id, email, modalidad_id from guests where modalidad_id is not null;
--     select clave, modalidad_id from email_templates where modalidad_id is not null;
--     select clave, asunto, cuerpo from email_templates
--     where clave like '%\_companeros';
--   (guardar los 3 como CSV verificado; sin esto, lo que sigue es irreversible).
--   R2. Plantillas B: la procedencia 0010 NO es demostrable por sistema (P4
--   es anotación manual y el contenido es circunstancial). El rollback SE
--   DETIENE aquí siempre y exige revisión manual: no hay borrado automático.
--   do $$
--   begin
--     raise exception 'Revisión manual obligatoria (R2): verificar (1) P4 no listaba estas claves, (2) asunto+cuerpo exactos 0010, (3) respaldo R1 guardado. Solo entonces borrar a mano.';
--   end $$;
--   (tras verificar los 3 puntos, borrado manual — solo filas 0010:)
--   delete from email_templates
--   where clave in ('agradecimiento_companeros','recordatorio_pago_companeros')
--     and cuerpo = ''
--     and asunto in ('¡Gracias por confirmar tu asistencia!','Recordatorio · Tarjeta Compañeros');
--   (verificar: 0 filas canónicas restantes; si alguna quedó, NO forzar.)
--   R2b. Alcance A: SOLO se revierte la asignación 0010 (modalidad=familiares).
--   Asignaciones posteriores distintas se conservan y se deciden a mano.
--   Residual declarado (no prevenible por sistema, sí recuperable desde R1):
--   si alguien reasignó manualmente un legacy a familiares post-0010 con el
--   mismo valor, este paso lo revierte; restaurarlo con el CSV de R1.
--   update email_templates set modalidad_id = null
--   where clave in ('agradecimiento','recordatorio_pago')
--     and modalidad_id = (select id from modalidades where codigo = 'familiares');
--   R3. Columnas e índices: SOLO los creados por 0010 según P3a/P5. Como el
--   seguimiento manual puede fallar, ANTES de cada DROP ejecutar su
--   verificación y exigir que coincida con el registro (control dual:
--   sistema y anotación deben coincidir; si difieren, no dropear):
--   select indexname, indexdef from pg_indexes where schemaname = 'public'
--     and indexname in ('guests_modalidad_idx','templates_modalidad_idx','email_logs_modalidad_idx');
--   (esperado para dropear: definición "btree (modalidad_id)" Y P5 decía
--   "ausente". 0006 usa los mismos dos primeros nombres: si P5 los registró
--   preexistentes, NO dropear aunque la definición coincida.)
--   (freno automático: aborta si policies ajenas usan modalidad_id)
--   do $$
--   begin
--     if exists (select 1 from pg_policies where schemaname = 'public'
--                and tablename in ('guests','email_templates','email_logs')
--                and (qual ilike '%modalidad_id%' or with_check ilike '%modalidad_id%')
--                and policyname not in ('mod_read','mod_admin')) then
--       raise exception 'Rollback bloqueado: policies ajenas usan modalidad_id (posible 0006/0007). Decidir a mano.';
--     end if;
--   end $$;
--   drop index if exists email_logs_modalidad_idx;
--   alter table email_logs drop column if exists modalidad_id;
--   drop index if exists templates_modalidad_idx;
--   alter table email_templates drop column if exists modalidad_id;
--   drop index if exists guests_modalidad_idx;
--   alter table guests drop column if exists modalidad_id;
--   R4. Tabla modalidades: SOLO si P2 decía "no existía". Verificación previa
--   obligatoria (solo lectura) antes de los DROP:
--   select policyname from pg_policies where schemaname = 'public' and tablename = 'modalidades';
--   select t.tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'modalidades';
--   (listado completo de FK hacia modalidades —incluye las 3 propias—:
--   esperado post-0010 solo guests/email_templates/email_logs; cualquier otra
--   tabla = dependencia ajena: parar)
--   SELECT
--     n_src.nspname AS esquema_origen,
--     src.relname AS tabla_origen,
--     con.conname AS restriccion,
--     n_ref.nspname AS esquema_referenciado,
--     ref.relname AS tabla_referenciada
--   FROM pg_constraint con
--   JOIN pg_class src ON src.oid = con.conrelid
--   JOIN pg_namespace n_src ON n_src.oid = src.relnamespace
--   JOIN pg_class ref ON ref.oid = con.confrelid
--   JOIN pg_namespace n_ref ON n_ref.oid = ref.relnamespace
--   WHERE con.contype = 'f'
--     AND n_ref.nspname = 'public'
--     AND ref.relname = 'modalidades';
--   (solo continuar si lo presente es propio o ya estaba registrado en P2b;
--   ante cualquier ajeno no registrado: parar.)
--   ABORTA si hay FK ajenas (p. ej. content_sections.modalidad_id de 0006):
--   do $$
--   begin
--     if exists (select 1 from pg_constraint co
--                join pg_class src on src.oid = co.conrelid
--                join pg_class ref on ref.oid = co.confrelid
--                where ref.relname = 'modalidades' and co.contype = 'f'
--                and src.relname not in ('guests','email_templates','email_logs')) then
--       raise exception 'Rollback bloqueado: modalidades tiene dependencias ajenas a 0010. No dropear.';
--     end if;
--   end $$;
--   (solo si P2 registró "no existía" Y P2b registró mod_* "ausentes":
--   policies propias; si preexistían, NO dropear aunque sean idénticas)
--   drop policy if exists mod_admin on modalidades;
--   drop policy if exists mod_read on modalidades;
--   (trigger propio solo si P2b lo registró ausente; el bloque de §5 nunca
--   crea duplicados ni toca ajenos)
--   drop trigger if exists t_modalidades on modalidades;
--   (restaurar estado RLS original — ALTERNATIVA EXCLUYENTE: solo si P2c decía
--   "disabled", la tabla preexistía y se conserva. En ese caso NO ejecutar
--   ningún DROP de R4, solo esto:)
--   alter table modalidades disable row level security;
--   (si se dropea la tabla, OMITIR el disable anterior:)
--   drop table modalidades;
--   R5. RESTAURAR asignaciones (revertir la reversión): re-aplicar 0010 y, con
--   el CSV de R1, por cada fila:
--     update guests set modalidad_id = '<modalidad_id>' where id = '<id>';
--     update email_templates set modalidad_id = '<modalidad_id>' where clave = '<clave>';
--   (más los cuerpos B del CSV si R2 los había borrado).
-- ============================================================
