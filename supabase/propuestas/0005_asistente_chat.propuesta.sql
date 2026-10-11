-- ============================================================
-- XV-ANTONELLA · PROPUESTA 0005 · Chats persistentes del asistente
-- Estado: PROPUESTA — NO aplicada, NO está en migrations/ (db push la ignora).
-- Requiere: aprobación explícita + mover a migrations/ como 0005.
--
-- ALCANCE: solo persistencia servidor de conversaciones y mensajes.
-- El PDF se genera en el navegador (impresión → PDF): no requiere Storage,
-- no deja archivos con datos privados y no necesita permisos extra.
-- El motor conversacional es determinista y local (sin proveedor externo).
--
-- SEGURIDAD:
--   - Cada fila pertenece a un admin (owner = auth.uid()).
--   - RLS: owner total sobre lo propio; nadie ve chats ajenos; anónimo nada.
--   - Sin secretos ni PII innecesaria en metadatos (título derivado del texto).
--   - Borrado en cascada al eliminar la conversación.
-- ROLLBACK: drop table if exists assistant_messages; drop table if exists
-- assistant_conversations;
-- ============================================================

create table assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Identidad derivada de la SESIÓN (auth.uid()), no de datos del cliente:
  -- el frontend nunca envía owner; la RLS lo verifica igual.
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null default 'Nueva conversación' check (char_length(titulo) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_conv_owner_idx on assistant_conversations (owner, updated_at desc);

create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations (id) on delete cascade,
  rol text not null check (rol in ('usuario', 'asistente')),
  texto text not null check (char_length(texto) between 1 and 4000),
  datos jsonb,
  created_at timestamptz not null default now()
);
create index assistant_msg_conv_idx on assistant_messages (conversation_id, created_at);

-- Reutiliza xv_touch_updated_at() de la migración 0001 (no se redefine aquí
-- para no revertir cambios futuros de esa función).
create trigger t_assistant_conv before update on assistant_conversations
  for each row execute function xv_touch_updated_at();

alter table assistant_conversations enable row level security;
alter table assistant_messages enable row level security;

-- Propietario total sobre lo propio (lectura, creación, edición, borrado).
create policy ac_owner on assistant_conversations
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Mensajes: solo dentro de conversaciones propias.
create policy am_owner_select on assistant_messages
  for select using (
    exists (
      select 1 from assistant_conversations c
      where c.id = conversation_id and c.owner = auth.uid()
    )
  );
-- Solo INSERT (los mensajes son inmutables: sin UPDATE deliberado) + DELETE.
-- Orden total de lectura: ORDER BY created_at, id (desempata el mismo ms).
-- created_at acepta valor explícito SOLO para migrar el historial con sus
-- fechas originales; jamás se actualiza después. Los topes (20 chats,
-- 100 mensajes, 80/4000 caracteres) los aplica la app; la DB valida tipos.
create policy am_owner_insert on assistant_messages
  for insert with check (
    exists (
      select 1 from assistant_conversations c
      where c.id = conversation_id and c.owner = auth.uid()
    )
  );
create policy am_owner_delete on assistant_messages
  for delete using (
    exists (
      select 1 from assistant_conversations c
      where c.id = conversation_id and c.owner = auth.uid()
    )
  );
