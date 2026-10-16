# 0010 · Checklist de ejecución manual (SQL Editor, proyecto `btwvxcapfpqpjxvoakxl`)

> Estado: **NO ejecutado**. Todo lo de abajo lo corre una persona en
> Supabase → SQL Editor. Nada aquí se aplicó ni se aplica solo.
> Archivo de migración: `0010_modalidades_correos.propuesta.sql` (pegarlo
> completo en el paso 2). Prohibido: `0007`, `db push`, triggers, envíos.

## 0. Condiciones de aprobación (todas obligatorias)

- [ ] Respaldo verificable de `email_templates` guardado (paso 1, con conteo).
- [ ] P1–P5 (incl. P2c de estado RLS) sin bloqueos; preexistencias anotadas para R0.
- [ ] Tras aplicar: N1–N4 revisados antes de seguir.
- [ ] `modalidad_id IS NULL` ⇒ clasificación manual con evidencia (C1–C4).
- [ ] **NO aplicar `0007`** mientras N1 > 0.
- [ ] Plantillas B con cuerpo real verificadas antes de sus correos.
- [ ] Apps Script siempre con `DRY_RUN=true` hasta la prueba con lista.

## 1. Respaldo (antes de todo)

```sql
-- B0 · ¿cuántas plantillas hay? Anotar el número (esperado hoy: 2).
select count(*) as plantillas from email_templates;
```

```sql
-- B1 · Respaldo completo. Guardar el resultado como CSV (Download results).
select id, clave, asunto, cuerpo from email_templates order by clave;
```

- **Verifica:** que B1 tenga las mismas filas que B0.
- **Detiene si:** B0 = 0 (sin plantillas: resolver antes) o B1 no se puede guardar.

## 2. Pre-checks P1–P3 (antes de la migración)

```sql
-- P1 · Tablas base existen (0001 aplicado).
select to_regclass('public.guests') as guests,
       to_regclass('public.email_templates') as templates,
       to_regclass('public.email_logs') as logs;
-- Esperado: las 3 con su nombre (no null). Detiene si alguna es null.
```

```sql
-- P2 · Estado de modalidades (solo lectura). ANOTAR el resultado: rige el
-- rollback (R0/R4: lo preexistente no se dropea jamás).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'modalidades'
order by ordinal_position;
-- Esperado: 0 filas (no existe: la crea 0010) O columnas con codigo y
-- precio_tarjeta (la creó 0006: reutilizar, seguir igual).
-- Detiene si: existe SIN codigo/precio_tarjeta (forma incompatible: avisar).
```

```sql
-- P2b · Preexistencias que condicionan el rollback (anotar todo).
-- Inspección completa RLS: comando, roles, permisiva/restrictiva, USING, WITH CHECK.
select policyname, cmd, roles, permissive, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'modalidades'
  and policyname in ('mod_read','mod_admin');
select tgname from pg_trigger where tgname = 't_modalidades';
-- Esperado estándar 0010/0006: mod_read(SELECT, {public}, permisiva, (true));
-- mod_admin(ALL, {public}, permisiva, (xv_es_admin()), (xv_es_admin())).
-- Se anota lo que haya. Si difiere, 0010 conserva y avisa por NOTICE.
-- Rige R4: mod_* preexistentes NO se dropean jamás (ni idénticos).
```

```sql
-- P2c · Estado RLS original de modalidades (rige restauración en R4).
select relname, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where relname = 'modalidades';
-- Esperado hoy: 0 filas (no existe). Si existe: ANOTAR rls_enabled/forced.
-- Solo si decía rls_enabled=false y la tabla se conserva, R4 restaura con
-- disable (alternativa excluyente al DROP).
```

```sql
-- P3a · ¿ya existen las columnas? (0 filas = aún no, estado esperado
-- pre-0010; ANOTAR: solo se revierten las que 0010 haya creado).
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and column_name = 'modalidad_id'
  and table_name in ('guests','email_templates','email_logs');
```

```sql
-- P3b · Pendientes (solo si P3a devolvió 1 fila; si no, omitir).
select count(*) as pendientes from guests where modalidad_id is null;
-- Esperado: cualquier número ≥ 0. Solo se anota (son los pendientes C1).
-- No detiene: NULL es el estado previsto, no un error.
```

```sql
-- P4 · Plantillas *_companeros preexistentes (rigen R2: solo se borran en
-- rollback las de procedencia 0010 demostrada).
select clave, char_length(cuerpo) as largo,
       (select codigo from modalidades where id = t.modalidad_id) as modalidad
from email_templates t where clave like '%\_companeros' order by 1;
-- Esperado hoy: 0 filas. ANOTAR cada fila si existe (clave, largo, modalidad):
-- esas NO se borran en rollback salvo decisión manual tras respaldo.
```

```sql
-- P5 · Índices preexistentes (rigen R3: 0006 usa los mismos nombres
-- guests_modalidad_idx/templates_modalidad_idx; solo se dropean los creados
-- por 0010. content_modalidad_idx delata a 0006 ya aplicada).
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('guests_modalidad_idx','templates_modalidad_idx',
    'email_logs_modalidad_idx','content_modalidad_idx');
-- ANOTAR cada fila. Detiene el DROP correspondiente en R3 si preexistía.
```

## 3. Aplicación

Pegar **todo** `0010_modalidades_correos.propuesta.sql` en SQL Editor y
ejecutar una vez. Es idempotente: si algo se interrumpe, se puede re-ejecutar
completo (no ejecutar fragmentos sueltos).

## 4. Post-checks N1–N4 (después; revisar antes de continuar)

```sql
-- N1 · Pendientes de clasificación.
select count(*) as pendientes from guests where modalidad_id is null;
-- Esperado: ≥ 0 (los históricos quedan NULL a propósito).
-- Condición: mientras sea > 0, prohibido 0007 y prohibidos envíos a esos
-- invitados (el GAS-compat los bloquea solo).
```

```sql
-- N2 · Reparto por modalidad (visibilidad, no clasificación).
select m.codigo, count(g.id) as invitados
from modalidades m
left join guests g on g.modalidad_id = m.id
group by 1 order by 1;
-- Esperado: 2 filas (companeros, familiares), conteos ≥ 0.
-- Detiene si: falta alguna de las 2 filas (seed incompleto: re-ejecutar 0010).
```

```sql
-- N3 · Mapeo de plantillas.
select clave,
       (select codigo from modalidades where id = t.modalidad_id) as modalidad,
       char_length(cuerpo) as largo_cuerpo
from email_templates t
order by 1;
-- Esperado: 'agradecimiento' y 'recordatorio_pago' con modalidad=familiares
-- y largo>0; las 2 '*_companeros' con modalidad=companeros y largo=0
-- (vacías hasta redactar: sus correos quedan bloqueados, es lo previsto).
-- Detiene si: falta alguna de las 4 filas, alguna A quedó sin modalidad,
-- o alguna A quedó con largo=0 (plantilla A vaciada: restaurar desde B1).
```

```sql
-- N4 · Índices y claves foráneas creadas.
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in ('guests_modalidad_idx','templates_modalidad_idx','email_logs_modalidad_idx');
-- Esperado: exactamente las 3 filas.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.guests','public.email_templates','public.email_logs')
  and contype = 'f' and pg_get_constraintdef(oid) like '%modalidades%';
-- Esperado: 3 FK hacia modalidades(id). Detiene si falta alguna.
```

## 5. Clasificación C1–C4 (manual, con evidencia, de a pocos)

```sql
-- C1 · Pendientes vigentes (únicos candidatos).
select id, nombre_apellido, email, asistencia, estado_pago, created_at
from guests where modalidad_id is null order by created_at;
```

```sql
-- C2 · Clasificar SOLO con evidencia (comprobante, pago, consulta directa).
-- Pegar UUIDs explícitos; nunca por precio/apellido/grupo/correo.
update guests
set modalidad_id = (select id from modalidades where codigo = 'familiares')
where id in ('<uuid-1>', '<uuid-2>');
```

- C3: repetir N1 hasta 0. Recién con N1 = 0 se evalúa un futuro NOT NULL.
- C4: mientras N1 > 0, esos invitados no reciben correos ni se modifican.

## 6. Rollback seguro (solo si hace falta; por pasos con frenos)

Orden exacto (cada bloque DO aborta con error si detecta riesgo: eso es lo
previsto, no un fallo):

- **R0.** Tener a mano lo anotado en P2/P2b/P2c/P3a/P4/P5. Lo preexistente no se toca. Frenos automáticos (DO que abortan) y condiciones manuales (a confirmar) sin confundir.
- **R1.** Respaldo (obligatorio, verificable): las 3 consultas del rollback
  (`guests` asignados, `templates` asignados, cuerpos B) guardadas como CSV.
  Sin esto, no seguir.
- **R2.** Revisión manual obligatoria siempre (la procedencia 0010 no es
  demostrable por sistema): el bloque aborta a propósito; verificar P4 +
  asunto/cuerpo exactos + respaldo y borrar a mano. Alcance A: revertir
  **solo donde modalidad=familiares** (residual declarado: reasignación manual
  idéntica post-0010 se revierte; recuperable desde R1).
- **R3.** Control dual: ejecutar las verificaciones de `indexdef`, exigir que
  coincidan con P3a/P5 y que sean btree(modalidad_id); aborta (automático) si
  hay policies ajenas. Dropear **solo lo verificado como propio**.
- **R4.** Verificaciones previas obligatorias (policies, triggers, FK) antes
  de los DROP; dropear tabla/`mod_*` **solo si P2/P2b decían "no existía"/
  "ausentes"**. Restaurar RLS con `disable` **solo** como alternativa
  excluyente (P2c=disabled + tabla conservada), nunca junto al DROP.
  Listado FK (esperado post-0010: solo guests/email_templates/email_logs;
  otra tabla = parar):
```sql
SELECT
  n_src.nspname AS esquema_origen,
  src.relname AS tabla_origen,
  con.conname AS restriccion,
  n_ref.nspname AS esquema_referenciado,
  ref.relname AS tabla_referenciada
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace n_src ON n_src.oid = src.relnamespace
JOIN pg_class ref ON ref.oid = con.confrelid
JOIN pg_namespace n_ref ON n_ref.oid = ref.relnamespace
WHERE con.contype = 'f'
  AND n_ref.nspname = 'public'
  AND ref.relname = 'modalidades';
```
- **R5.** Restaurar (revertir la reversión): re-aplicar 0010 y por cada fila
  del CSV: `update guests set modalidad_id = '<id>' where id = '<uuid>';`
  y `update email_templates set modalidad_id = '<id>' where clave = '<clave>';`
  más los cuerpos B si R2 los borró.

Condición pendiente (requiere estado remoto, no resoluble en local): si al
revertir aparecen policies/triggers/FK ajenos no registrados en P2–P3a,
detenerse y decidir a mano; no forzar con CASCADE.

## 7b. Diagnóstico de solo lectura (sin cambios; cuando se necesite)

```sql
-- D1 · ¿0010 aplicada? (0 filas en ambas = esquema pre-0010).
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name = 'modalidad_id'
  and table_name in ('guests','email_templates','email_logs');
select to_regclass('public.modalidades') as modalidades;
```

```sql
-- D2 · Reparto de modalidades (NULL = pendientes de clasificar).
select coalesce(m.codigo, '(sin modalidad)') as modalidad, count(g.id) as invitados
from guests g left join modalidades m on m.id = g.modalidad_id
group by 1 order by 1;
```

```sql
-- D3 · Candidatos a clasificar: vigentes sin modalidad (únicos que importan).
select id, nombre_apellido, email, asistencia, estado_pago, importe_estimado, created_at
from guests where modalidad_id is null
  and asistencia <> 'no_asistira' order by created_at;
```

```sql
-- D4 · Plantillas por modalidad y contenido (largo=0 = bloqueada en GAS).
select clave,
  (select codigo from modalidades where id = t.modalidad_id) as modalidad,
  char_length(cuerpo) as largo from email_templates t order by 1;
```

```sql
-- D5 · Envíos por modalidad y pendientes sin guest (baja física previa).
select coalesce((select codigo from modalidades where id = l.modalidad_id), '(sin dato)') as modalidad,
  l.estado, count(*) from email_logs l group by 1, 2 order by 1, 2;
select count(*) as huerfanos from email_logs where guest_id is null;
```

```sql
-- D6 · Correos duplicados entre modalidades (relevante para 0008-fase-B).
select email, count(*) as filas,
  string_agg(distinct coalesce((select codigo from modalidades where id = g.modalidad_id), '(null)'), ', ') as mods
from guests g group by email having count(*) > 1;
```

## 7. Puertas siguientes (no abrir antes)

- `0007`: solo con N1 = 0 y decisión explícita (su backfill masivo sigue
  prohibido con pendientes).
- Correos B: solo con N3 mostrando cuerpos B > 0 redactados en el panel.
- GAS-compat: instalar con `DRY_RUN=true` + `TEST_ONLY_EMAILS`=tu correo,
  corrida manual (esperar DRY-RUN sin escrituras), luego prueba real acotada.
