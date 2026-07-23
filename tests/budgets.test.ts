import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { copyBudget, upsertBudget } from '@/domain/budgets';
import { budgetId } from '@/db/ids';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.temas.put({ id: 'x', name: 'X' });
  await db.subtemas.bulkPut([
    { id: 'x--a', name: 'A', temaId: 'x' },
    { id: 'x--b', name: 'B', temaId: 'x' },
  ]);
});

describe('budget helpers', () => {
  it('upsertBudget creates and updates in place', async () => {
    const first = await upsertBudget('2026-07', 'x--a', 100000, 'COP');
    expect(first!.previstoMinor).toBe(100000);
    expect(first!.id).toBe(budgetId('2026-07', 'x--a'));

    const second = await upsertBudget('2026-07', 'x--a', 150000, 'COP');
    expect(second!.previstoMinor).toBe(150000);
    expect(await db.budgets.count()).toBe(1);
  });

  it('upsertBudget with 0 or negative deletes the row', async () => {
    await upsertBudget('2026-07', 'x--a', 100000, 'COP');
    const res = await upsertBudget('2026-07', 'x--a', 0, 'COP');
    expect(res).toBeNull();
    expect(await db.budgets.count()).toBe(0);
  });

  it('copyBudget skips existing entries unless overwrite=true', async () => {
    await upsertBudget('2026-06', 'x--a', 100000, 'COP');
    await upsertBudget('2026-06', 'x--b', 200000, 'COP');
    await upsertBudget('2026-07', 'x--a', 999999, 'COP');

    const first = await copyBudget('2026-06', '2026-07', 'COP');
    expect(first.copied).toBe(1);
    expect(first.skipped).toBe(1);
    expect((await db.budgets.get(budgetId('2026-07', 'x--a')))!.previstoMinor).toBe(999999);
    expect((await db.budgets.get(budgetId('2026-07', 'x--b')))!.previstoMinor).toBe(200000);

    const second = await copyBudget('2026-06', '2026-07', 'COP', true);
    expect(second.copied).toBe(2);
    expect((await db.budgets.get(budgetId('2026-07', 'x--a')))!.previstoMinor).toBe(100000);
  });

  it('copyBudget respects currency', async () => {
    await upsertBudget('2026-06', 'x--a', 100000, 'COP');
    await upsertBudget('2026-06', 'x--b', 5000, 'BRL');
    const res = await copyBudget('2026-06', '2026-07', 'BRL');
    expect(res.copied).toBe(1);
    expect(await db.budgets.get(budgetId('2026-07', 'x--b'))).toBeTruthy();
    expect(await db.budgets.get(budgetId('2026-07', 'x--a'))).toBeUndefined();
  });
});
