# Crear la administradora — XV-ANTONELLA (sin exponer contraseñas)

> Estado: pendiente del correo de la administradora. Nada de este procedimiento
> se ejecuta hasta contar con ese dato y autorización explícita.

## 0. Prerrequisito

- Email de la administradora (usuario solicitado: `Guadalopez`).
- Acceso al Dashboard de Supabase con rol de owner/admin del proyecto.

## 1. Verificar el proyecto correcto

Antes de tocar nada, confirmar en la URL del Dashboard que el ref es:

```
btwvxcapfpqpjxvoakxl
```

Si dice `vhxdiewbeebjgxmnjrpe` es **Mercado Servicio**: no tocar.

## 2. Crear el usuario en Supabase Auth

1. Entrar a **Authentication → Users**.
2. **Add user → Create new user**.
3. Completar:
   - **Email**: el de la administradora.
   - **Password**: generarla con un gestor de contraseñas (no reutilizar claves).
   - Marcar **Auto Confirm user** (el proyecto aún no tiene SMTP propio; sin esto
     el login queda bloqueado esperando confirmación por correo).
4. **Create user** y copiar el **UID** generado (columna UID).

La contraseña vive solo en el Dashboard y en el gestor personal de la
administradora. Nunca va al chat, al repo, a `.env` ni a ningún SQL.

## 3. Asociarlo a `admin_profiles` (requiere autorización; lo ejecuta el agente)

```sql
insert into admin_profiles (user_id, email, nombre, activo)
values ('PEGAR-AQUI-EL-UID', 'email-de-la-admin@example.com', 'Guadalopez', true);
```

Verificación (solo lectura):

```sql
select user_id, email, nombre, activo, created_at
from admin_profiles
where activo = true;
```

## 4. Probar el acceso

Seguir `docs/probar-panel-local.md`. Un login correcto muestra el panel; sin fila
en `admin_profiles` la misma contraseña válida es rechazada con "no es administrador".

## 5. Revocar acceso (si hiciera falta)

```sql
update admin_profiles set activo = false where email = 'email-de-la-admin@example.com';
```

Y en **Authentication → Users**: *Ban user* o eliminar. Ambas acciones quedan
fuera del historial de auditoría de la app: registrarlas manualmente.
