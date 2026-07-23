import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement } from '@/domain/movements';
import { computeStatement } from '@/domain/statement';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'a', name: 'A', currency: 'COP', createdAt: now },
    { id: 'b', name: 'B', currency: 'COP', createdAt: now },
  ]);
  await db.temas.put({ id: 'comida', name: 'Comida' });
  await db.subtemas.put({ id: 'comida--rest', name: 'Restaurantes', temaId: 'comida' });
});

describe('computeStatement', () => {
  it('sorts by date, includes transferencias from and to, and computes running balance', async () => {
    await createMovement({
      kind: 'ingreso',
      date: '2026-01-05',
      description: 'Nómina',
      amount: 3000000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'transferencia',
      date: '2026-01-10',
      description: 'Retiro',
      amount: 500000,
      currency: 'COP',
      fromAccountId: 'a',
      toAccountId: 'b',
    });
    await createMovement({
      kind: 'gasto',
      date: '2026-01-15',
      description: 'Restaurante',
      amount: 40000,
      currency: 'COP',
      accountId: 'a',
      subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'transferencia',
      date: '2026-01-20',
      description: 'Devolución',
      amount: 100000,
      currency: 'COP',
      fromAccountId: 'b',
      toAccountId: 'a',
    });

    const stA = await computeStatement('a');
    expect(stA.rows.map(r => r.movement.description)).toEqual([
      'Nómina', 'Retiro', 'Restaurante', 'Devolución',
    ]);
    expect(stA.rows.map(r => r.signedMinor)).toEqual([3000000, -500000, -40000, 100000]);
    expect(stA.rows.map(r => r.runningMinor)).toEqual([3000000, 2500000, 2460000, 2560000]);
    expect(stA.totalMinor).toBe(2560000);

    const stB = await computeStatement('b');
    expect(stB.rows.map(r => r.signedMinor)).toEqual([500000, -100000]);
    expect(stB.totalMinor).toBe(400000);
    expect(stB.rows[0]!.counterpartyAccountId).toBe('a');
  });

  it('includes ajuste rows on the target account', async () => {
    await db.movements.put({
      id: 'x1',
      date: '2026-02-01',
      month: '2026-02',
      description: 'Desface',
      currency: 'COP',
      amountMinor: -12000,
      kind: 'ajuste',
      accountId: 'a',
      reconciliationId: 'rec-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const st = await computeStatement('a');
    expect(st.totalMinor).toBe(-12000);
    expect(st.rows[0]!.movement.kind).toBe('ajuste');
  });
});
