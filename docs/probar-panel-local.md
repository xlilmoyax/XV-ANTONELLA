# Probar el panel administrativo en local — XV-ANTONELLA

> Requiere: administradora creada (ver `docs/crear-admin.md`) y `.env.local`
> configurado. El frontend local apunta a la **base remota real**: toda prueba
> de escritura usa filas de prueba y termina con limpieza verificada.

## 1. Arrancar

```bash
cd "C:\Users\prisc\OneDrive\Documentos\XV-ANTONELLA"
npm install   # solo la primera vez
npm run dev   # http://localhost:5173
```

Abrir `http://localhost:5173/#admin`.

## 2. Checklist de prueba

1. **Login denegado sin privilegio**: con un email válido pero sin fila en
   `admin_profiles` debe mostrar "no es administrador" (si existe un usuario así;
   si no, omitir).
2. **Login correcto**: email + contraseña de la administradora → entra al panel.
3. **Resumen**: contadores coherentes (seed: 0 invitados; 1 evento; 9 secciones).
4. **Invitados**: búsqueda, filtros de asistencia/pago, paginación y descarga CSV.
5. **Escritura de prueba**: crear una confirmación desde `#confirmar` con correo
   `panel-test-…@example.com`, editarle asistencia y estado de pago desde el panel,
   verificar que aparece en **Historial** con actor y valores anterior/nuevo.
6. **Pagos**: marcar `pago_verificado` y luego revertir a `pendiente_pago` sobre la
   fila de prueba (nunca sobre datos reales).
7. **Galería**: subir 1 imagen de prueba y eliminarla (verificar el objeto en Storage).
8. **Contenidos**: cambiar un texto, publicar (verifica que se crea respaldo en
   versiones) y restaurarlo.
9. **Correos**: debe mostrarse el aviso "preparada pero NO activada" y cero envíos.
10. **Salir**: botón SALIR cierra sesión y `#admin` vuelve a pedir login.

## 3. Limpieza obligatoria

Borrar todas las filas `panel-test-%` (invitados; los pagos/attendees caen en
cascada; logs por clave) y verificar en cero antes de dar la etapa por cerrada.

## 4. Fuera de alcance en esta fase

Envíos de correo, Edge Functions, `db push`, cambios en Mercado Servicio/XLMX
Barber y cualquier dato que no sea de prueba.
