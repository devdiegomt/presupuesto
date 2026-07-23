import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement, updateMovement } from '@/domain/movements';
import { computeBalances } from '@/domain/balances';
import { computeStatement } from '@/domain/statement';
import { computeBalanceAsOf } from '@/domain/reconcile';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'davi', name: 'Davivienda', currency: 'COP', createdAt: now },
    { id: 'brl', name: 'Efectivo BRL', currency: 'BRL', createdAt: now },
  ]);
});

describe('bimonetary transfer', () => {
  it('stores toAmountMinor + toCurrency; balances update per currency', async () => {
    // Send 1,000,000 COP → 1,000 BRL (rate 1 COP = 0.001 BRL)
    const m = await createMovement({
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'Envío a Brasil',
      amount: 1_000_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'brl',
      toAmount: 1000,
      toCurrency: 'BRL',
    });

    expect(m.amountMinor).toBe(1_000_000);       // COP (unit = 1)
    expect(m.toAmountMinor).toBe(100_000);       // BRL 1000.00 = 100000 centavos
    expect(m.toCurrency).toBe('BRL');

    const bal = await computeBalances();
    const davi = bal.find(b => b.accountId === 'davi')!;
    const brl = bal.find(b => b.accountId === 'brl')!;
    expect(davi.balanceMinor).toBe(-1_000_000);   // COP
    expect(brl.balanceMinor).toBe(100_000);       // BRL centavos
  });

  it('statement per account shows the amount in that account currency', async () => {
    await createMovement({
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'x',
      amount: 500_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'brl',
      toAmount: 500,
      toCurrency: 'BRL',
    });

    const stDavi = await computeStatement('davi');
    expect(stDavi.rows[0]!.signedMinor).toBe(-500_000); // COP
    expect(stDavi.totalMinor).toBe(-500_000);

    const stBrl = await computeStatement('brl');
    expect(stBrl.rows[0]!.signedMinor).toBe(50_000);   // BRL centavos
    expect(stBrl.totalMinor).toBe(50_000);
  });

  it('same-currency transfer still round-trips (no toAmount)', async () => {
    await db.accounts.put({ id: 'nequi', name: 'Nequi', currency: 'COP', createdAt: new Date().toISOString() });
    const m = await createMovement({
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'retiro',
      amount: 200_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'nequi',
    });
    expect(m.toAmountMinor).toBeUndefined();
    expect(m.toCurrency).toBeUndefined();
    const bal = await computeBalances();
    expect(bal.find(b => b.accountId === 'davi')!.balanceMinor).toBe(-200_000);
    expect(bal.find(b => b.accountId === 'nequi')!.balanceMinor).toBe(200_000);
  });

  it('computeBalanceAsOf respects bimonetary credit', async () => {
    await createMovement({
      kind: 'transferencia',
      date: '2026-07-10',
      description: 'x',
      amount: 300_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'brl',
      toAmount: 300,
      toCurrency: 'BRL',
    });
    expect(await computeBalanceAsOf('brl', '2026-07-09')).toBe(0);
    expect(await computeBalanceAsOf('brl', '2026-07-10')).toBe(30_000);
    expect(await computeBalanceAsOf('davi', '2026-07-10')).toBe(-300_000);
  });

  it('editing a bimonetary transfer preserves both sides', async () => {
    const m = await createMovement({
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'x',
      amount: 400_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'brl',
      toAmount: 400,
      toCurrency: 'BRL',
    });
    const updated = await updateMovement(m.id, {
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'x2',
      amount: 500_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'brl',
      toAmount: 480,
      toCurrency: 'BRL',
    });
    expect(updated.amountMinor).toBe(500_000);
    expect(updated.toAmountMinor).toBe(48_000);

    // Change to same-currency should clear toAmountMinor
    await db.accounts.put({ id: 'nequi', name: 'Nequi', currency: 'COP', createdAt: new Date().toISOString() });
    const same = await updateMovement(m.id, {
      kind: 'transferencia',
      date: '2026-07-22',
      description: 'x3',
      amount: 500_000,
      currency: 'COP',
      fromAccountId: 'davi',
      toAccountId: 'nequi',
    });
    expect(same.toAmountMinor).toBeUndefined();
    expect(same.toCurrency).toBeUndefined();
  });
});
