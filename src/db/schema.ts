import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  ImportIssue,
  ImportRecord,
  MonthClosure,
  Movement,
  Reconciliation,
  Setting,
  Subtema,
  SyncTombstone,
  Tema,
} from './types';

/**
 * Tablas que se sincronizan con Supabase, en orden padre → hijo.
 *
 * Ninguna usa PK autoincremental: todas tienen ids string estables entre
 * dispositivos (slug, ULID o clave compuesta). Por eso la PK local puede
 * usarse tal cual como `sync_id` remoto, sin capa de indirección.
 *
 * Fuera quedan a propósito: `imports` e `importIssues` (bitácora local de una
 * migración puntual, sin valor en otro dispositivo) y `settings` (preferencias
 * de este equipo).
 */
export const SYNCABLE_TABLES = [
  'accounts',
  'temas',
  'subtemas',
  'budgets',
  'movements',
  'reconciliations',
  'monthClosures',
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

/**
 * Forma de escritura de una entidad syncable: `updatedAt` es opcional porque el
 * hook 'creating' lo rellena si falta (ver src/db/hooks.ts). Al leer, en cambio,
 * el campo siempre está — por eso el tipo de lectura lo declara obligatorio.
 *
 * Es el tercer genérico de Dexie 4, `Table<T, TKey, TInsertType>`, pensado
 * justo para campos autopoblados.
 */
type Insertable<T> = Omit<T, 'updatedAt'> & { updatedAt?: string };

export class PresupuestoDB extends Dexie {
  accounts!: Table<Account, string, Insertable<Account>>;
  temas!: Table<Tema, string, Insertable<Tema>>;
  subtemas!: Table<Subtema, string, Insertable<Subtema>>;
  movements!: Table<Movement, string, Insertable<Movement>>;
  budgets!: Table<Budget, string, Insertable<Budget>>;
  reconciliations!: Table<Reconciliation, string, Insertable<Reconciliation>>;
  imports!: Table<ImportRecord, string>;
  importIssues!: Table<ImportIssue, number>;
  settings!: Table<Setting, string>;
  monthClosures!: Table<MonthClosure, string, Insertable<MonthClosure>>;
  syncTombstones!: Table<SyncTombstone, number>;

  constructor() {
    super('presupuesto');
    this.version(1).stores({
      accounts:
        'id, currency, archived',
      temas:
        'id, name',
      subtemas:
        'id, temaId, name',
      movements:
        'id, date, month, kind, accountId, subtemaId, fromAccountId, toAccountId, reconciliationId, [month+kind], [accountId+date], [subtemaId+month]',
      budgets:
        'id, month, subtemaId, [month+subtemaId]',
      reconciliations:
        'id, accountId, date',
      imports:
        'id, importedAt, source',
      importIssues:
        '++id, importId, kind',
      settings:
        'key',
    });
    this.version(2).stores({
      monthClosures:
        'id, month, currency, closedAt, [month+currency]',
    });
    // v3: sync. `updatedAt` pasa a ser índice en las tablas syncables para que
    // el push pueda pedir "lo modificado desde X" sin escanear la tabla entera.
    this.version(3)
      .stores({
        accounts:
          'id, currency, archived, updatedAt',
        temas:
          'id, name, updatedAt',
        subtemas:
          'id, temaId, name, updatedAt',
        movements:
          'id, date, month, kind, accountId, subtemaId, fromAccountId, toAccountId, reconciliationId, updatedAt, [month+kind], [accountId+date], [subtemaId+month]',
        budgets:
          'id, month, subtemaId, updatedAt, [month+subtemaId]',
        reconciliations:
          'id, accountId, date, updatedAt',
        monthClosures:
          'id, month, currency, closedAt, updatedAt, [month+currency]',
        syncTombstones:
          '++id, tableName, [tableName+rowId]',
      })
      .upgrade(async tx => {
        // Backfill: las filas que ya existían no tienen updatedAt y sin él
        // quedarían invisibles para el push. Se usa la marca de tiempo que ya
        // tenga la fila para no inventar un orden que nunca ocurrió.
        const fallback = new Date().toISOString();
        for (const table of SYNCABLE_TABLES) {
          await tx.table(table).toCollection().modify(row => {
            if (!row.updatedAt) {
              row.updatedAt = row.createdAt ?? row.closedAt ?? fallback;
            }
          });
        }
      });
  }
}

export const db = new PresupuestoDB();
