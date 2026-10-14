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
| Correos automáticos | ⚠️ **Apps Script/Gmail en modo seguro; no activado** |
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

Pruebas locales: `npm test`. Build: `npm run build`. Lint: `npm run lint`.

## Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Pública, safe en frontend |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Pública, con RLS activo |
| `ADMIN_EMAIL` | La que se dé de alta en Auth | No es secreto, solo referencia |

> ⚠️ Jamás usar la `service_role` key en el navegador. Solo en Edge Functions / servidor.

## Supabase: migraciones y seed

1. Crear proyecto en Supabase.
2. SQL Editor → ejecutar `supabase/migrations/0001_xv_schema.sql`.
3. Ejecutar `supabase/migrations/0002_fix_public_insert.sql` solo tras revisar su política RLS.
4. Ejecutar `supabase/seed.sql` (carga datos oficiales del evento).
5. La migración `0003_modalidades_rsvp_seguro.sql` es una propuesta local pendiente de aprobación: **no ejecutar en Supabase remoto** sin autorización. No infiere modalidades ni modifica invitados existentes.
6. Storage: el bucket `galeria` (público) lo crea la migración. Subir fotos desde el panel.
7. Auth → Users → **crear el usuario admin** (ver abajo). Sin registro público.

Las propuestas previas bajo `supabase/propuestas/` no forman parte de la secuencia aplicada. Para esta integración, usar solo la nueva migración `0003`; no aplicar en paralelo propuestas antiguas de modalidades o RPC.

## Crear la administradora (usuario solicitado: `Guadalopez`)

1. Supabase Dashboard → Authentication → Users → *Add user* → *Create new user* con el email de la administradora y una contraseña segura (generarla ahí, no escribirla en ningún archivo).
2. En SQL Editor, darla de alta como admin (reemplazar `USER_ID` y `EMAIL`):
   ```sql
   insert into admin_profiles (user_id, email, nombre, activo)
   values ('USER_ID', 'EMAIL', 'Guadalopez', true);
   ```
3. Ingresar en la web con `#admin` usando ese email + contraseña.

El login usa Supabase Auth real; el panel verifica `admin_profiles` en backend (RLS). Sin fila activa ahí, no hay acceso aunque haya sesión.

## Correo: APPS SCRIPT/GMAIL (no activar aún)

Los envíos del repositorio quedan en Google Apps Script/Gmail. Los handlers Edge `enviar-correo` y `recordatorios` están deshabilitados localmente y responden HTTP 410; **no se hizo deploy**, por lo que cualquier versión remota anterior no se considera desactivada.

No habilitar correos durante la revisión. Las propiedades de Apps Script deben seguir en `DRY_RUN=true`, `ENVIAR_A_INVITADOS=false`, y `TEST_ONLY_EMAILS` limitada a la dirección de prueba ya autorizada. No se cambian claves, destinatarios ni propiedades desde el repositorio. Antes de usar el script por modalidad, revisar [modalidades y correo](./docs/modalidades-y-correos.md).

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
