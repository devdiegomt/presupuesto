-- presupuesto — esquema de sync para Supabase.
-- Correr una sola vez en Dashboard → SQL Editor → New query.
--
-- Modelo: una sola tabla JSONB por usuario. Cada fila representa un registro de
-- cualquier tabla Dexie (accounts, movements, budgets, …), identificado por
-- (user_id, table_name, sync_id).
--
-- DIFERENCIA IMPORTANTE con el schema.sql de planilla-app, del que este deriva:
-- allá `sync_id` es `uuid`, porque esa app genera un UUID aparte para cada fila
-- (sus PKs de Dexie son autoincrementales y no sirven fuera de su propia base).
-- Acá `sync_id` es TEXT: las PKs de presupuesto ya son estables entre
-- dispositivos y se usan tal cual como sync_id, pero NO son UUIDs —
-- son slugs ('davivienda'), ULIDs ('01KZ067YT30XG6PSMAC9TW81WP') y claves
-- compuestas ('2026-07|comida--rest'). Con la columna en uuid, el primer push
-- falla con "invalid input syntax for type uuid".

create extension if not exists "pgcrypto";

create table if not exists public.sync_records (
  sync_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, table_name, sync_id)
);

-- Pulls incrementales: "todo lo de esta tabla modificado después de X".
create index if not exists sync_records_updated_at_idx
  on public.sync_records (user_id, table_name, updated_at desc);

-- Índice parcial para tombstones (filas con deleted_at no nulo).
create index if not exists sync_records_deleted_idx
  on public.sync_records (user_id, table_name, deleted_at)
  where deleted_at is not null;

-- Row Level Security: cada usuario solo ve y edita lo suyo. Esto es lo que
-- protege los datos; la anon key es pública por diseño.
alter table public.sync_records enable row level security;

drop policy if exists "own records select" on public.sync_records;
drop policy if exists "own records insert" on public.sync_records;
drop policy if exists "own records update" on public.sync_records;
drop policy if exists "own records delete" on public.sync_records;

create policy "own records select" on public.sync_records
  for select using (user_id = auth.uid());
create policy "own records insert" on public.sync_records
  for insert with check (user_id = auth.uid());
create policy "own records update" on public.sync_records
  for update using (user_id = auth.uid());
create policy "own records delete" on public.sync_records
  for delete using (user_id = auth.uid());

-- Verificación rápida:
--   select count(*) filter (where deleted_at is null)     as vivas,
--          count(*) filter (where deleted_at is not null) as tombstones
--   from public.sync_records;
