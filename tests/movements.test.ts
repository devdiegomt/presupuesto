import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement, deleteMovement, updateMovement } from '@/domain/movements';
import { computeBalances } from '@/domain/balances';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'a', name: 'A', currency: 'COP', createdAt: now },
    { id: 'b', name: 'B', currency: 'COP', createdAt: now },
    { id: 'brl', name: 'BR', currency: 'BRL', createdAt: now },
  ]);
  await db.temas.put({ id: 'comida', name: 'Comida' });
  await db.subtemas.put({ id: 'comida--rest', name: 'Restaurantes', temaId: 'comida' });
});

describe('createMovement', () => {
  it('gasto stores negative amount and hits its account', async () => {
    const m = await createMovement({
      kind: 'gasto',
      date: '2026-07-22',
      description: 'Test',
      amount: 25000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    expect(m.amountMinor).toBe(-25000);
    expect(m.month).toBe('2026-07');

    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(-25000);
  });

  it('ingreso stores positive amount', async () => {
    await createMovement({
      kind: 'ingreso',
      date: '2026-07-22',
      description: 'Nómina',
      amount: 3000000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(3000000);
  });

  it('transferencia moves value from -> to', async () => {
    await createMovement({
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'Retiro',
      amount: 200000,
      currency: 'COP',
      fromAccountId: 'a',
      toAccountId: 'b',
      note: 'Retiro',
    });
    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(-200000);
    expect(bal.find(b => b.accountId === 'b')!.balanceMinor).toBe(200000);
  });

  it('update preserves id/createdAt/legacyId and refreshes updatedAt', async () => {
    const created = await createMovement({
      kind: 'gasto',
      date: '2026-07-22',
      description: 'Original',
      amount: 25000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    await db.movements.update(created.id, { legacyId: 42 });
    const originalCreatedAt = created.createdAt;

    await new Promise(r => setTimeout(r, 5));
    const updated = await updateMovement(created.id, {
      kind: 'gasto',
      date: '2026-07-23',
      description: 'Modificado',
      amount: 30000,
      currency: 'COP',
      accountId: 'b',
      subtemaId: 'comida--rest',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(originalCreatedAt);
    expect(updated.legacyId).toBe(42);
    expect(updated.updatedAt > originalCreatedAt).toBe(true);
    expect(updated.description).toBe('Modificado');
    expect(updated.accountId).toBe('b');
    expect(updated.amountMinor).toBe(-30000);

    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(0);
    expect(bal.find(b => b.accountId === 'b')!.balanceMinor).toBe(-30000);
  });

  it('delete removes movement and its reconciliation if ajuste', async () => {
    const gasto = await createMovement({
      kind: 'gasto',
      date: '2026-07-22',
      description: 'X',
      amount: 10000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    await deleteMovement(gasto.id);
    expect(await db.movements.get(gasto.id)).toBeUndefined();

    await db.reconciliations.put({
      id: 'rec-1',
      accountId: 'a',
      date: '2026-07-22',
      declaredBalanceMinor: 0,
      computedBalanceMinor: 12000,
      deltaMinor: -12000,
      createdAt: new Date().toISOString(),
    });
    await db.movements.put({
      id: 'aj-1',
      date: '2026-07-22',
      month: '2026-07',
      description: 'Desface',
      currency: 'COP',
      amountMinor: -12000,
      kind: 'ajuste',
      accountId: 'a',
      reconciliationId: 'rec-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await deleteMovement('aj-1');
    expect(await db.movements.get('aj-1')).toBeUndefined();
    expect(await db.reconciliations.get('rec-1')).toBeUndefined();
  });

  it('BRL amount is stored in minor units (centavos)', async () => {
    const m = await createMovement({
      kind: 'gasto',
      date: '2026-07-22',
      description: 'Pão',
      amount: 12.5,
      currency: 'BRL',
      accountId: 'brl',
      subtemaId: 'comida--rest',
    });
    expect(m.amountMinor).toBe(-1250);
  });
});
