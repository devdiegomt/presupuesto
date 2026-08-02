import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { installSyncHooks, txWithTombstones, withoutSyncMeta } from '@/db/hooks';
import { createMovement, deleteMovement, updateMovement } from '@/domain/movements';
import { createAccount, deleteAccount } from '@/domain/accounts';
import { createSubtema, createTema, deleteSubtema } from '@/domain/catalog';
import { upsertBudget } from '@/domain/budgets';

installSyncHooks();

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('hook: updatedAt', () => {
  it('se autopobla al crear aunque el objeto no lo traiga', async () => {
    await db.accounts.put({
      id: 'a',
      name: 'A',
      currency: 'COP',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const row = await db.accounts.get('a');
    expect(row!.updatedAt).toBeTruthy();
  });

  it('respeta el updatedAt que venga explícito (no lo pisa)', async () => {
    const remoteStamp = '2020-05-05T00:00:00.000Z';
    await db.accounts.put({
      id: 'a',
      name: 'A',
      currency: 'COP',
      createdAt: remoteStamp,
      updatedAt: remoteStamp,
    });
    expect((await db.accounts.get('a'))!.updatedAt).toBe(remoteStamp);
  });

  it('se refresca en cada update', async () => {
    const acc = await createAccount({ name: 'Nu', currency: 'COP' });
    const before = (await db.accounts.get(acc.id))!.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    await db.accounts.update(acc.id, { name: 'Nu Bank' });
    const after = (await db.accounts.get(acc.id))!.updatedAt;
    expect(after > before).toBe(true);
  });

  it('un update que trae updatedAt explícito manda sobre el hook', async () => {
    const acc = await createAccount({ name: 'Nu', currency: 'COP' });
    const forced = '2019-01-01T00:00:00.000Z';
    await db.accounts.update(acc.id, { name: 'X', updatedAt: forced });
    expect((await db.accounts.get(acc.id))!.updatedAt).toBe(forced);
  });

  it('withoutSyncMeta desactiva el bump', async () => {
    const acc = await createAccount({ name: 'Nu', currency: 'COP' });
    const before = (await db.accounts.get(acc.id))!.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    await withoutSyncMeta(async () => {
      await db.accounts.update(acc.id, { name: 'Sin bump' });
    });
    expect((await db.accounts.get(acc.id))!.updatedAt).toBe(before);
  });
});

describe('hook: tombstones', () => {
  beforeEach(async () => {
    const t = await createTema('Comida');
    await createSubtema('Restaurantes', t.id);
    await createAccount({ name: 'Efectivo', currency: 'COP' });
  });

  it('deleteMovement encola un tombstone con la tabla y el id', async () => {
    const m = await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'x',
      amount: 1000, currency: 'COP',
      accountId: 'efectivo', subtemaId: 'comida--restaurantes',
    });
    await deleteMovement(m.id);

    const ts = await db.syncTombstones.toArray();
    expect(ts).toHaveLength(1);
    expect(ts[0]!.tableName).toBe('movements');
    expect(ts[0]!.rowId).toBe(m.id);
  });

  it('deleteAccount, deleteSubtema y borrar un budget también encolan', async () => {
    const acc = await createAccount({ name: 'Temporal', currency: 'COP' });
    await deleteAccount(acc.id);

    const t2 = await createTema('Otro');
    const s2 = await createSubtema('Sub', t2.id);
    await deleteSubtema(s2.id);

    await upsertBudget('2026-01', 'comida--restaurantes', 100000, 'COP');
    await upsertBudget('2026-01', 'comida--restaurantes', 0, 'COP'); // 0 = borrar

    const ts = await db.syncTombstones.toArray();
    const tables = ts.map(t => t.tableName).sort();
    expect(tables).toEqual(['accounts', 'budgets', 'subtemas']);
  });

  it('un delete aplicado desde el sync NO encola tombstone', async () => {
    const m = await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'x',
      amount: 1000, currency: 'COP',
      accountId: 'efectivo', subtemaId: 'comida--restaurantes',
    });
    await withoutSyncMeta(async () => {
      await db.movements.delete(m.id);
    });
    expect(await db.syncTombstones.count()).toBe(0);
  });

  it('borrar un ajuste arrastra su reconciliación y deja DOS tombstones', async () => {
    const now = new Date().toISOString();
    await db.reconciliations.put({
      id: 'rec-1', accountId: 'efectivo', date: '2026-01-31',
      declaredBalanceMinor: 0, computedBalanceMinor: 5000, deltaMinor: -5000,
      createdAt: now, updatedAt: now,
    });
    await db.movements.put({
      id: 'aj-1', date: '2026-01-31', month: '2026-01', description: 'Desface',
      currency: 'COP', amountMinor: -5000, kind: 'ajuste',
      accountId: 'efectivo', reconciliationId: 'rec-1',
      createdAt: now, updatedAt: now,
    });

    await deleteMovement('aj-1');

    const ts = await db.syncTombstones.toArray();
    expect(ts.map(t => t.tableName).sort()).toEqual(['movements', 'reconciliations']);
  });

  it('txWithTombstones permite borrar sin TransactionInactiveError', async () => {
    const acc = await createAccount({ name: 'Z', currency: 'COP' });
    // El hook escribe en syncTombstones usando la tx en curso; si la tabla no
    // estuviera en el scope, esto reventaría.
    await expect(
      txWithTombstones([db.accounts], async () => {
        await db.accounts.delete(acc.id);
      }),
    ).resolves.not.toThrow();
    expect(await db.syncTombstones.count()).toBe(1);
  });
});

describe('updateMovement mantiene la metadata de sync', () => {
  it('bumpea updatedAt y conserva createdAt', async () => {
    const t = await createTema('Comida');
    const s = await createSubtema('Restaurantes', t.id);
    await createAccount({ name: 'Efectivo', currency: 'COP' });
    const m = await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'x',
      amount: 1000, currency: 'COP', accountId: 'efectivo', subtemaId: s.id,
    });
    await new Promise(r => setTimeout(r, 5));
    const updated = await updateMovement(m.id, {
      kind: 'gasto', date: '2026-01-01', description: 'y',
      amount: 2000, currency: 'COP', accountId: 'efectivo', subtemaId: s.id,
    });
    expect(updated.createdAt).toBe(m.createdAt);
    expect(updated.updatedAt > m.updatedAt).toBe(true);
  });
});
