-- Arreglo para proyectos donde se corrió el schema.sql de planilla-app tal cual.
--
-- Allá `sync_id` es uuid. Presupuesto usa su PK local como sync_id y esas PKs
-- no son UUIDs: slugs ('davivienda'), ULIDs ('01KZ067YT30XG6PSMAC9TW81WP') y
-- claves compuestas ('2026-07|comida--rest'). Sin este cambio, el primer push
-- falla con: invalid input syntax for type uuid.
--
-- text es estrictamente más permisivo que uuid, así que la conversión no puede
-- perder datos: cualquier uuid existente sigue siendo válido como texto.
-- La PK (user_id, table_name, sync_id) se mantiene.
--
-- Si ya corriste supabase/schema.sql de ESTE repo, no hace falta: ya está text.

alter table public.sync_records
  alter column sync_id type text;

-- Por si el proyecto se creó antes de la migración de tombstones.
alter table public.sync_records
  add column if not exists deleted_at timestamptz;

create index if not exists sync_records_deleted_idx
  on public.sync_records (user_id, table_name, deleted_at)
  where deleted_at is not null;

-- Verificación: debe decir 'text'.
--   select data_type from information_schema.columns
--   where table_name = 'sync_records' and column_name = 'sync_id';
