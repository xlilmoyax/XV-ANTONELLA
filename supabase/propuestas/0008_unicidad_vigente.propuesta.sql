-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0008 · Unicidad por correo solo en vigentes
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
--
-- PROBLEMA: la baja lógica conserva la fila (asistencia='no_asistira') pero
-- UNIQUE(email) la bloquea para siempre: un dado de baja no puede reinscribirse
-- y el borrado físico es la única salida. Regla de negocio: UNA inscripción
-- VIGENTE por correo (y por modalidad cuando exista modalidad_id).
--
-- SOLUCIÓN: índice único PARCIAL (los UNIQUE simples no admiten WHERE).
-- Seguro ante concurrencia: el índice es el árbitro, no una consulta previa.
--   - Dos activos con mismo correo → 23505 (mensajes actuales siguen vigentes).
--   - Dado de baja → reinscripción permitida (el viejo está exento del índice).
--   - Borrado físico → libera igual que hoy.
-- PRECONDICIÓN (ejecutar antes, debe dar 0 filas):
--   SELECT email, count(*) FROM guests WHERE asistencia <> 'no_asistira'
--   GROUP BY email HAVING count(*) > 1;
--   Si devuelve filas, conciliar manualmente primero (no borrar en masa).
-- EVOLUCIÓN: al aplicar modalidad_id (propuesta 0006/0007), reemplazar por
--   UNIQUE(email, modalidad_id) WHERE asistencia <> 'no_asistira'.
-- ROLLBACK: drop index + re-add constraint (falla si hubiera duplicados
-- activos: verificar con la misma consulta antes de revertir).
-- ============================================================

alter table guests drop constraint guests_email_unico;

create unique index guests_email_vigente_idx
  on guests (email)
  where asistencia <> 'no_asistira';
