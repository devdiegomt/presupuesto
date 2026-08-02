/**
 * Hooks de Dexie que mantienen viva la metadata de sincronización.
 *
 * Dos invariantes de las que depende TODO el motor de sync:
 *
 *  1. Cada escritura refresca `updatedAt`. El push sube "lo que cambió desde
 *     el último push" y el merge resuelve por last-write-wins; sin el bump,
 *     una edición local nunca subiría o perdería contra una remota vieja.
 *  2. Cada delete deja un tombstone. Una fila borrada que no deja rastro es
 *     una fila que el próximo pull vuelve a bajar del servidor.
 *
 * Excepción deliberada: cuando el que escribe es el propio sync (aplicando algo
 * que vino del servidor) NO hay que tocar nada — el `updatedAt` remoto es el
 * bueno, y el delete remoto no debe generar un tombstone que lo reboten de
 * vuelta. Para eso está `withoutSyncMeta()`.
 */

import type { Table } from 'dexie';
import { db, SYNCABLE_TABLES } from './schema';

/**
 * Bandera de reentrada. Es un contador y no un boolean para soportar llamadas
 * anidadas sin que la interna reactive los hooks al salir.
 */
let suppressDepth = 0;

/** Corre `fn` sin que los hooks bumpeen updatedAt ni registren tombstones. */
export async function withoutSyncMeta<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth += 1;
  try {
    return await fn();
  } finally {
    suppressDepth -= 1;
  }
}

export function isSuppressed(): boolean {
  return suppressDepth > 0;
}

/**
 * Transacción de escritura con `syncTombstones` incluido en el scope.
 *
 * Todo borrado sobre una tabla syncable tiene que pasar por acá. El hook
 * 'deleting' escribe el tombstone usando la transacción en curso, y si la tabla
 * no está en el scope la escritura revienta con TransactionInactiveError.
 */
export function txWithTombstones<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tables: Table<any, any>[],
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction('rw', [...tables, db.syncTombstones], fn);
}

let installed = false;

/**
 * Instala los hooks. Idempotente: llamarlo dos veces no duplica handlers.
 *
 * Se llama desde el arranque de la app (main.tsx) y desde los tests. No se hace
 * en el constructor de la DB porque Dexie exige que la instancia exista antes
 * de colgarle hooks.
 */
export function installSyncHooks(): void {
  if (installed) return;
  installed = true;

  const now = () => new Date().toISOString();

  for (const tableName of SYNCABLE_TABLES) {
    const table = db.table(tableName);

    table.hook('creating', function (_pk, obj) {
      if (isSuppressed()) return;
      const row = obj as Record<string, unknown>;
      // Si el objeto ya trae updatedAt (import masivo, o una fila que viene del
      // servidor por una ruta que no pasó por withoutSyncMeta) se respeta:
      // pisarlo marcaría como "recién editado" algo que no lo está.
      if (!row.updatedAt) row.updatedAt = now();
    });

    table.hook('updating', function (modifications) {
      if (isSuppressed()) return undefined;
      const mods = modifications as Record<string, unknown>;
      // Un update que ya especifica updatedAt manda (mismo razonamiento).
      if ('updatedAt' in mods) return undefined;
      return { updatedAt: now() };
    });

    table.hook('deleting', function (pk, _obj, trans) {
      if (isSuppressed()) return;
      if (typeof pk !== 'string') return;
      // OBLIGATORIO usar trans.table(), no db.syncTombstones: el hook corre
      // dentro de una transacción activa, y tocar la db por fuera abre otra
      // transacción que muere con TransactionInactiveError — en silencio,
      // porque el hook de Dexie es síncrono y nadie await-ea el rechazo.
      //
      // Como contrapartida, `syncTombstones` DEBE estar en el scope 'rw' de
      // toda transacción que borre. De eso se encarga txWithTombstones().
      trans.table('syncTombstones').put({
        tableName,
        rowId: pk,
        deletedAt: now(),
      });
    });
  }
}
