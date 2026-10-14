# Modalidades, clasificación histórica y correo

## Diagnóstico y arquitectura

- El esquema anterior guardaba únicamente `guests.importe_estimado`; no identificaba la modalidad ni impedía que el RSVP público insertara su propio importe.
- La web tiene una confirmación familiar y una tarjeta separada de Compañeros; el panel carga invitados, asistentes, pagos, plantillas y registros de correo desde Supabase.
- `supabase/migrations/0001_xv_schema.sql` y `0002_fix_public_insert.sql` son la secuencia activa previa. Los archivos numerados dentro de `supabase/propuestas/` son borradores y no deben mezclarse con la migración nueva.
- Google Apps Script/Gmail es el único flujo de correo en el código local. Los dos handlers Edge que usaban un proveedor externo ahora están deshabilitados localmente; no se desplegaron cambios y no se verificó ni alteró el proyecto remoto.

## Reglas integradas

| Modalidad | Código | Regla |
|---|---|---|
| Familia y amigos | `familia_amigos` | 21:00–05:00; $70.000 por persona de 10 años o más; menor de 10 exento; admite acompañantes |
| Compañeros | `companeros` | 21:00–02:00; $40.000 por compañero; una sola persona; sin exención por edad |

El formulario confirma expresamente la modalidad y remite ambos flujos a `registrar_rsvp`. La RPC obtiene el precio del catálogo controlado, valida la composición y calcula el total en servidor; no acepta `importe_estimado` del navegador como fuente. La modalidad queda NULL para registros históricos. El panel permite clasificar manualmente y conserva el importe hasta que una persona autorizada acepte el cálculo mostrado.

Las métricas, saldos calculados y recordatorios solo incluyen registros confirmados cuya modalidad, composición e importe coinciden con las reglas; las filas históricas sin clasificar o inconsistentes quedan visibles para revisión y no generan recordatorios automáticos. Los campos globales antiguos `event_settings.precio_tarjeta` y `edad_minima_paga` ya no se usan para las reglas de pago ni se pueden editar/restaurar desde el panel.

## Registros históricos y clasificación pendiente

No se consultó Supabase remoto y, por lo tanto, no se puede enumerar aquí la lista actual de filas históricas. Después de una autorización de solo lectura, esta consulta permite preparar esa lista sin cambiar datos:

```sql
select id, nombre_apellido, email, asistencia, estado_pago,
       cantidad_adultos, cantidad_menores, importe_estimado, created_at
from public.guests
where modalidad_id is null
order by created_at;
```

No se cambió ninguna fila de producción. Para cualquier registro cuya clasificación haya sido confirmada por una persona autorizada, primero confirmar su identidad usando un identificador interno verificado y revisar asistentes, edades y acompañantes. No incluir nombres, emails ni otros datos personales en notas o commits:

```sql
select id, nombre_apellido, email, cantidad_adultos, cantidad_menores,
       importe_estimado, modalidad_id
from public.guests
where id = '<UUID verificado>';

select nombre, edad_al_evento, es_titular, debe_abonar
from public.attendees
where guest_id = '<UUID verificado>';
```

Con la composición validada, calcular $70.000 multiplicado por el número de personas de 10 años o más. Compararlo con el importe guardado y revisar cada diferencia. No actualizar el importe histórico ni clasificar el registro en producción hasta tener autorización explícita. Para una clasificación posterior, usar el UUID verificado y solo establecer la FK:

```sql
update public.guests
set modalidad_id = (select id from public.modalidades where codigo = 'familia_amigos')
where id = '<UUID verificado>'
  and modalidad_id is null;
```

Este último SQL es una instrucción manual futura, no fue ejecutada. Para recalcular un importe desde el panel se requiere revisión de la composición, un preview válido y autorización explícita; de lo contrario se conserva el valor existente. Invitados sin modalidad o con importe/composición inconsistente no reciben correos.

## Validación local de la migración

No ejecutar estos pasos contra el proyecto remoto:

1. En una base Supabase local desechable, aplicar en orden las migraciones `0001`, `0002` y `0003`.
2. Ejecutar `supabase/tests/0003_modalidades_rsvp_seguro.sql` en esa base local. El archivo abre una transacción y la revierte; comprueba cálculo servidor, edades 9/10, importe de Compañeros, rechazo de acompañantes y rechazo de modalidad desconocida.
3. Verificar la tabla y las filas del catálogo:

   ```sql
   select codigo, precio_tarjeta, hora_inicio, hora_fin,
          permite_acompanantes, edad_minima_paga
   from public.modalidades
   order by codigo;
   ```

4. Confirmar que los registros históricos conservan modalidad NULL y el importe original:

   ```sql
   select count(*) as sin_clasificar
   from public.guests
   where modalidad_id is null;
   ```

5. Inspeccionar políticas en `guests` y `attendees`: no debe quedar política pública INSERT; `registrar_rsvp(jsonb)` debe poder ejecutarse por `anon`/`authenticated`, y las demás operaciones deben conservar permisos administrativos.
6. Antes de cualquier despliegue, revisar el resultado, respaldar la base y autorizar explícitamente la aplicación remota. No aplicar las propuestas antiguas `0003`/`0006`/`0010` junto con la migración nueva.

Después de revisar las plantillas de la modalidad familiar, su asociación puede hacerse explícitamente:

```sql
update public.email_templates
set modalidad_id = (select id from public.modalidades where codigo = 'familia_amigos')
where clave in ('agradecimiento', 'recordatorio_pago')
  and modalidad_id is null;
```

No se asociaron plantillas durante la migración. Las plantillas de Compañeros deben redactarse y aprobarse antes de vincularlas; una plantilla vacía o sin modalidad bloquea los envíos.

## Correo: estado seguro y recuperación

- No se enviaron correos ni se escribieron registros remotos durante estos cambios.
- La fuente por modalidad es `apps-script/CorreosXV-modalidades.gs`; `apps-script/CorreosXV.gs` queda bloqueado como legado porque no valida modalidad.
- Mantener `DRY_RUN=true`, `ENVIAR_A_INVITADOS=false` y `TEST_ONLY_EMAILS` limitada al destinatario de prueba autorizado. No modificar credenciales ni configurar un proveedor nuevo.
- El script por modalidad solo permite una prueba real cuando `TEST_ONLY_EMAILS` contiene exactamente una dirección válida; filtra candidatos antes de crear logs o consumir cuota. Los recordatorios se detienen si `event_settings.recordatorio_cada_dias` no es exactamente 10.
- El script solo selecciona una plantilla ligada a la misma modalidad. Bloquea modalidad NULL, edades/composición inválidas, importes inconsistentes, plantilla ausente, invitaciones no confirmadas y pagos distintos de pendiente para recordatorios.
- Conserva claves de idempotencia. Un registro pendiente o fallido bloquea reintentos automáticos. `recuperarAvisoFallido` es manual, exige confirmación de no entrega, motivo auditable, configuración explícita y destinatario en lista de prueba; una clave determinista permite un único reintento manual por aviso original.
- Si Gmail acepta el correo pero falla el PATCH del log, o Gmail produce un error cuyo resultado no se puede conocer, el registro queda pendiente con nota de incertidumbre y no se marca fallido ni se reenvía automáticamente. Los errores Supabase no relacionados con duplicados se propagan y abortan el envío.
- Para una prueba real aprobada: verificar migración y plantillas primero; dejar en `TEST_ONLY_EMAILS` solo el email de prueba autorizado; cambiar temporalmente `DRY_RUN=false` y `ENVIAR_A_INVITADOS=true`; ejecutar manualmente y comprobar recepción y `email_logs`; restaurar ambos flags a sus valores seguros al terminar. Si un log queda pendiente, conciliar Gmail antes de cualquier acción. No se habilita el envío a invitados sin autorización explícita posterior.
- El intervalo efectivo de recordatorios es 10 días y la fecha límite se lee de `event_settings`.
- Los handlers Edge del repositorio devuelven 410, pero una versión ya desplegada puede seguir activa hasta que se revise y desactive remotamente mediante autorización separada.

## Riesgos / pendientes antes de operación

- La migración y la guía de pruebas aún no se ejecutaron contra una base local ni remota.
- Los registros históricos requieren clasificación individual. No hay un inventario local de los datos remotos.
- Los cuerpos de plantilla se deben asociar explícitamente a cada modalidad y revisar antes de cualquier prueba de correo.
- El entorno remoto, las propiedades de Apps Script, eventuales triggers y despliegues Edge no se consultaron ni modificaron.
