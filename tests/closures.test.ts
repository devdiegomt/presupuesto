import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement } from '@/domain/movements';
import { upsertBudget } from '@/domain/budgets';
import {
  closeMonth,
  computeClosureDrift,
  getClosure,
  lastDayOfMonth,
  reopenMonth,
} from '@/domain/closures';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'davi', name: 'Davivienda', currency: 'COP', createdAt: now },
    { id: 'nequi', name: 'Nequi', currency: 'COP', createdAt: now },
    { id: 'brl', name: 'Efectivo BRL', currency: 'BRL', createdAt: now },
  ]);
  await db.temas.put({ id: 'comida', name: 'Comida' });
  await db.subtemas.put({ id: 'comida--rest', name: 'Restaurantes', temaId: 'comida' });
  await upsertBudget('2026-07', 'comida--rest', 300000, 'COP');
});

describe('closures', () => {
  it('lastDayOfMonth handles Feb and 30-day months', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30');
    expect(lastDayOfMonth('2026-07')).toBe('2026-07-31');
  });

  it('closeMonth snapshots totals and per-account end-of-month balances', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-07-05', description: 'Salario',
      amount: 3000000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-07-10', description: 'Restaurante',
      amount: 25000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    // Este es agosto: no debe entrar en el snapshot de julio
    await createMovement({
      kind: 'gasto', date: '2026-08-01', description: 'Agosto',
      amount: 999999, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });

    const c = await closeMonth('2026-07', 'COP', 'Cierre de julio');
    expect(c.snapshot.grandPrevistoMinor).toBe(300000);
    expect(c.snapshot.grandRealMinor).toBe(3000000 + 25000);
    expect(c.snapshot.temas).toHaveLength(1);
    expect(c.note).toBe('Cierre de julio');

    const davi = c.snapshot.balancesByAccount.find(b => b.accountId === 'davi')!;
    expect(davi.balanceMinor).toBe(3000000 - 25000);
    expect(c.snapshot.balancesByAccount.every(b => b.accountId !== 'brl')).toBe(true);
  });

  it('drift appears after a retroactive edit and clears when updated', async () => {
    await createMovement({
      kind: 'gasto', date: '2026-07-10', description: 'x',
      amount: 25000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    const c = await closeMonth('2026-07', 'COP');
    let drift = await computeClosureDrift(c);
    expect(drift.hasDrift).toBe(false);

    await createMovement({
      kind: 'gasto', date: '2026-07-15', description: 'retro',
      amount: 40000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    drift = await computeClosureDrift(c);
    expect(drift.hasDrift).toBe(true);
    expect(drift.grandRealDelta).toBe(40000);

    const c2 = await closeMonth('2026-07', 'COP');
    const drift2 = await computeClosureDrift(c2);
    expect(drift2.hasDrift).toBe(false);
    expect(c2.snapshot.grandRealMinor).toBe(25000 + 40000);
  });

  it('reopenMonth removes the closure', async () => {
    await closeMonth('2026-07', 'COP');
    expect(await getClosure('2026-07', 'COP')).toBeDefined();
    await reopenMonth('2026-07', 'COP');
    expect(await getClosure('2026-07', 'COP')).toBeUndefined();
  });

  it('closures are per-currency', async () => {
    const cop = await closeMonth('2026-07', 'COP');
    const brl = await closeMonth('2026-07', 'BRL');
    expect(cop.id).not.toBe(brl.id);
    expect(await getClosure('2026-07', 'COP')).toBeDefined();
    expect(await getClosure('2026-07', 'BRL')).toBeDefined();
    await reopenMonth('2026-07', 'BRL');
    expect(await getClosure('2026-07', 'COP')).toBeDefined();
    expect(await getClosure('2026-07', 'BRL')).toBeUndefined();
  });
});
