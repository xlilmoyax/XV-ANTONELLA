# XV-ANTONELLA · Invitación digital · Mis XV años de Antonella

Invitación digital interactiva con estética de bosque encantado, confirmación de
asistencia propia (Supabase), registro de pagos informados, panel administrativo
privado y correos automáticos (integración preparada, pendiente de activar).

**Evento:** 19 de diciembre de 2026 · 21:00 – 05:00 · Salón Aldo, C. José Ramonda 6637.

## Estado del proyecto

| Parte | Estado |
|---|---|
| Invitación pública (portada, countdown, evento, galería, pagos, música, cierre) | ✅ Implementada |
| Formulario de confirmación → Supabase | ✅ Implementado (requiere Supabase configurado) |
| Botón «Ya Aboné» | ✅ Estructura lista (requiere Edge Function con service_role) |
| Panel `/admin` (resumen, invitados, pagos, contenidos, galería, historial) | ✅ Base funcional |
| Correos automáticos | ⚠️ **PREPARADO, NO ACTIVADO** — falta proveedor + credenciales (ver abajo) |
| Dominio personalizado | Pendiente (deploy con URL temporal primero) |

## Requisitos

- Node 20+
- Proyecto Supabase (PostgreSQL + Auth + Storage)
- Cuenta Vercel para el deploy

## Instalación

```bash
npm install
cp .env.example .env.local   # completar valores (nunca commitear .env.local)
npm run dev                  # http://localhost:5173
```

## Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Pública, safe en frontend |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Pública, con RLS activo |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` | Proveedor a definir | **NO configurar hasta verificar proveedor** |
| `ADMIN_EMAIL` | La que se dé de alta en Auth | No es secreto, solo referencia |

> ⚠️ Jamás usar la `service_role` key en el navegador. Solo en Edge Functions / servidor.

## Supabase: migraciones y seed

1. Crear proyecto en Supabase.
2. SQL Editor → ejecutar `supabase/migrations/0001_xv_schema.sql`.
3. Ejecutar `supabase/seed.sql` (carga datos oficiales del evento).
4. Storage: el bucket `galeria` (público) lo crea la migración. Subir fotos desde el panel.
5. Auth → Users → **crear el usuario admin** (ver abajo). Sin registro público.

## Crear la administradora (usuario solicitado: `Guadalopez`)

1. Supabase Dashboard → Authentication → Users → *Add user* → *Create new user* con el email de la administradora y una contraseña segura (generarla ahí, no escribirla en ningún archivo).
2. En SQL Editor, darla de alta como admin (reemplazar `USER_ID` y `EMAIL`):
   ```sql
   insert into admin_profiles (user_id, email, nombre, activo)
   values ('USER_ID', 'EMAIL', 'Guadalopez', true);
   ```
3. Ingresar en la web con `#admin` usando ese email + contraseña.

El login usa Supabase Auth real; el panel verifica `admin_profiles` en backend (RLS). Sin fila activa ahí, no hay acceso aunque haya sesión.

## Correo: PENDIENTE DE VERIFICACIÓN (no activar aún)

Falta definir con la familia:

1. **Proveedor** (recomendado: Resend por simplicidad con Edge Functions).
2. **Dominio remitente verificado** (SPF/DKIM) y dirección `EMAIL_FROM`.
3. **API key** guardada como secreto de la Edge Function (nunca en el repo).

Cuando esté decidido, hay que crear:

- `supabase/functions/enviar-correo` (envío inmediato de agradecimiento, idempotente por `email_logs.idempotencia_clave`).
- `supabase/functions/ya-abone` (valida `token_accion`, marca `pago_informado`, detiene recordatorios).
- `supabase/functions/recordatorios` (cada 10 días —configurable—, solo confirmados con pago pendiente, nunca después del 10/12/2026, con control de concurrencia e historial).
- Scheduler: pg_cron o cron externo que invoque `recordatorios`.

Plantillas editables: tabla `email_templates` (`agradecimiento`, `recordatorio_pago`).

## Deploy en Vercel

1. Importar el repo `xlilmoyax/XV-ANTONELLA` en Vercel.
2. Framework: Vite. Build: `npm run build`. Output: `dist`.
3. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Deploy → URL temporal `*.vercel.app`. El dominio personalizado se configura después desde el panel de Vercel.

## Estructura

```
src/
  App.tsx            router por hash (#invitacion #confirmar #admin #ya-abone)
  xv/config.ts       valores oficiales por defecto (fallback sin Supabase)
  xv/types.ts        tipos de todas las entidades
  xv/pricing.ts      regla de edad + importe (único lugar)
  lib/supabaseClient.ts
  components/        Portada, Countdown, Evento, Galería, Pagos, Música,
                     Formulario, Cierre, Admin…
supabase/
  migrations/0001_xv_schema.sql   (tablas + RLS + storage)
  seed.sql                        (datos oficiales + plantillas)
```

## Decisiones que faltan (bloqueos concretos)

1. **Supabase**: URL + anon key del proyecto real (¿crear uno nuevo o usar existente?).
2. **Proveedor de correo + credenciales + remitente** (sin esto no se activa ningún envío).
3. **Email de la administradora** para crear su usuario en Auth.
4. **Fotos reales** (se suben desde el panel cuando estén; mientras tanto hay placeholders demo identificados).
5. **Texto del mensaje final** (campo configurable, vacío hasta recibirlo).
