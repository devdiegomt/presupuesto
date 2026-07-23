import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement, deleteMovement } from '@/domain/movements';
import { computeBalanceAsOf, createReconciliation } from '@/domain/reconcile';
import { computeBalances } from '@/domain/balances';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'a', name: 'A', currency: 'COP', createdAt: now },
    { id: 'b', name: 'B', currency: 'COP', createdAt: now },
  ]);
  await db.temas.put({ id: 'x', name: 'X' });
  await db.subtemas.put({ id: 'x--y', name: 'Y', temaId: 'x' });
});

describe('reconcile', () => {
  it('computeBalanceAsOf ignores movements after the cutoff', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-06-01', description: 'in',
      amount: 1000000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    await createMovement({
      kind: 'gasto', date: '2026-07-10', description: 'gasto futuro',
      amount: 300000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    expect(await computeBalanceAsOf('a', '2026-06-30')).toBe(1000000);
    expect(await computeBalanceAsOf('a', '2026-07-10')).toBe(700000);
  });

  it('createReconciliation with positive delta creates positive ajuste', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'salario',
      amount: 3000000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    const res = await createReconciliation({
      accountId: 'a', currency: 'COP', date: '2026-01-31',
      declaredBalanceMinor: 3050000,
    });
    expect(res.reconciliation.deltaMinor).toBe(50000);
    expect(res.adjustment).not.toBeNull();
    expect(res.adjustment!.amountMinor).toBe(50000);
    expect(res.adjustment!.kind).toBe('ajuste');
    expect(res.adjustment!.reconciliationId).toBe(res.reconciliation.id);

    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(3050000);
  });

  it('createReconciliation with negative delta creates negative ajuste', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'salario',
      amount: 3000000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    const res = await createReconciliation({
      accountId: 'a', currency: 'COP', date: '2026-01-31',
      declaredBalanceMinor: 2980000,
    });
    expect(res.adjustment!.amountMinor).toBe(-20000);
    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(2980000);
  });

  it('zero delta records reconciliation without an ajuste', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'salario',
      amount: 3000000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    const res = await createReconciliation({
      accountId: 'a', currency: 'COP', date: '2026-01-31',
      declaredBalanceMinor: 3000000,
    });
    expect(res.adjustment).toBeNull();
    expect(await db.reconciliations.count()).toBe(1);
    expect(await db.movements.where('kind').equals('ajuste').count()).toBe(0);
  });

  it('deleting the ajuste cascades to remove its reconciliation', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'salario',
      amount: 3000000, currency: 'COP', accountId: 'a', subtemaId: 'x--y',
    });
    const res = await createReconciliation({
      accountId: 'a', currency: 'COP', date: '2026-01-31',
      declaredBalanceMinor: 3050000,
    });
    await deleteMovement(res.adjustment!.id);
    expect(await db.reconciliations.get(res.reconciliation.id)).toBeUndefined();
    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'a')!.balanceMinor).toBe(3000000);
  });
});
