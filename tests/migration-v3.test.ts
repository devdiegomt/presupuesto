import { describe, expect, it, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from '@/db/schema';

/**
 * Migración v2 → v3 (la que va a correr sobre bases que ya tienen datos).
 *
 * La base "vieja" se crea con una instancia de Dexie que solo declara v1 y v2,
 * para que los stores queden con los índices reales que Dexie genera. Hacerlo a
 * mano con IndexedDB crudo no sirve: sin la metadata de índices que Dexie
 * espera, el upgrade recrea el store y el test mide un artefacto propio.
 */
class LegacyDB extends Dexie {
  constructor() {
    super('presupuesto');
    this.version(1).stores({
      accounts: 'id, currency, archived',
      temas: 'id, name',
      subtemas: 'id, temaId, name',
      movements:
        'id, date, month, kind, accountId, subtemaId, fromAccountId, toAccountId, reconciliationId, [month+kind], [accountId+date], [subtemaId+month]',
      budgets: 'id, month, subtemaId, [month+subtemaId]',
      reconciliations: 'id, accountId, date',
      imports: 'id, importedAt, source',
      importIssues: '++id, importId, kind',
      settings: 'key',
    });
    this.version(2).stores({
      monthClosures: 'id, month, currency, closedAt, [month+currency]',
    });
  }
}

beforeEach(async () => {
  if (db.isOpen()) db.close();
  await Dexie.delete('presupuesto');
});

describe('migración v2 → v3', () => {
  it('rellena updatedAt sin perder filas y crea syncTombstones', async () => {
    const legacy = new LegacyDB();
    await legacy.open();
    expect(legacy.verno).toBe(2);

    // Filas tal como las dejaría la app anterior: sin updatedAt.
    await legacy.table('accounts').put({
      id: 'davivienda', name: 'Davivienda', currency: 'COP',
      createdAt: '2024-07-01T00:00:00.000Z',
    });
    await legacy.table('temas').put({ id: 'comida', name: 'Comida' });
    await legacy.table('subtemas').put({
      id: 'comida--rest', name: 'Restaurantes', temaId: 'comida',
    });
    await legacy.table('budgets').put({
      id: '2026-07|comida--rest', month: '2026-07',
      subtemaId: 'comida--rest', previstoMinor: 300000, currency: 'COP',
    });
    await legacy.table('reconciliations').put({
      id: 'rec-1', accountId: 'davivienda', date: '2026-07-31',
      declaredBalanceMinor: 100, computedBalanceMinor: 90, deltaMinor: 10,
      createdAt: '2026-07-31T00:00:00.000Z',
    });
    await legacy.table('monthClosures').put({
      id: '2026-07|COP', month: '2026-07', currency: 'COP',
      closedAt: '2026-08-01T10:00:00.000Z', snapshot: {},
    });
    // Los movimientos ya traían updatedAt: no debe tocarse.
    await legacy.table('movements').put({
      id: 'mov-1', date: '2026-07-05', month: '2026-07', description: 'Almuerzo',
      currency: 'COP', amountMinor: -25000, kind: 'gasto',
      accountId: 'davivienda', subtemaId: 'comida--rest',
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    legacy.close();

    // Abrir con el schema actual dispara el upgrade.
    await db.open();
    expect(db.verno).toBe(3);

    // Nada se perdió.
    expect(await db.accounts.count()).toBe(1);
    expect(await db.temas.count()).toBe(1);
    expect(await db.subtemas.count()).toBe(1);
    expect(await db.budgets.count()).toBe(1);
    expect(await db.reconciliations.count()).toBe(1);
    expect(await db.monthClosures.count()).toBe(1);
    expect(await db.movements.count()).toBe(1);

    // Backfill: se prefiere la marca de tiempo que la fila ya tenía.
    expect((await db.accounts.get('davivienda'))!.updatedAt)
      .toBe('2024-07-01T00:00:00.000Z');
    expect((await db.reconciliations.get('rec-1'))!.updatedAt)
      .toBe('2026-07-31T00:00:00.000Z');
    expect((await db.monthClosures.get('2026-07|COP'))!.updatedAt)
      .toBe('2026-08-01T10:00:00.000Z');

    // Sin createdAt ni closedAt: fallback, pero presente.
    expect((await db.temas.get('comida'))!.updatedAt).toBeTruthy();
    expect((await db.budgets.get('2026-07|comida--rest'))!.updatedAt).toBeTruthy();

    // El updatedAt que ya existía no se pisa.
    expect((await db.movements.get('mov-1'))!.updatedAt)
      .toBe('2026-07-06T00:00:00.000Z');

    // La tabla nueva existe y arranca vacía.
    expect(await db.syncTombstones.count()).toBe(0);
  });

  it('deja todas las filas migradas listas para el primer push', async () => {
    const legacy = new LegacyDB();
    await legacy.open();
    await legacy.table('accounts').bulkPut([
      { id: 'a', name: 'A', currency: 'COP', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'b', name: 'B', currency: 'COP', createdAt: '2024-01-02T00:00:00.000Z' },
    ]);
    legacy.close();

    await db.open();
    // El índice de updatedAt es lo que usa pushAll para juntar lo pendiente;
    // si el backfill no hubiera corrido, esta query devolvería 0 y las filas
    // viejas nunca subirían.
    const pending = await db.accounts.where('updatedAt').above('1970-01-01T00:00:00.000Z').count();
    expect(pending).toBe(2);
  });
});
