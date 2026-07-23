import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement } from '@/domain/movements';
import { computeMonthSummary } from '@/domain/monthly';
import { budgetId } from '@/db/ids';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.put({ id: 'a', name: 'A', currency: 'COP', createdAt: now });
  await db.temas.bulkPut([
    { id: 'comida', name: 'Comida' },
    { id: 'moto', name: 'Moto' },
  ]);
  await db.subtemas.bulkPut([
    { id: 'comida--rest', name: 'Restaurantes', temaId: 'comida' },
    { id: 'comida--snacks', name: 'Snacks', temaId: 'comida' },
    { id: 'moto--gasolina', name: 'Gasolina', temaId: 'moto' },
  ]);
  await db.budgets.bulkPut([
    {
      id: budgetId('2026-07', 'comida--rest'),
      month: '2026-07',
      subtemaId: 'comida--rest',
      previstoMinor: 300000,
      currency: 'COP',
    },
    {
      id: budgetId('2026-07', 'moto--gasolina'),
      month: '2026-07',
      subtemaId: 'moto--gasolina',
      previstoMinor: 200000,
      currency: 'COP',
    },
  ]);
});

describe('computeMonthSummary', () => {
  it('rolls up subtemas into temas with correct real/previsto/diff/pct', async () => {
    await createMovement({
      kind: 'gasto', date: '2026-07-05', description: 'Almuerzo',
      amount: 25000, currency: 'COP', accountId: 'a', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-07-10', description: 'Cena',
      amount: 45000, currency: 'COP', accountId: 'a', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-07-15', description: 'Gasolina',
      amount: 220000, currency: 'COP', accountId: 'a', subtemaId: 'moto--gasolina',
    });

    const s = await computeMonthSummary('2026-07', 'COP');
    expect(s.temas.map(t => t.name)).toEqual(['Comida', 'Moto']);

    const comida = s.temas.find(t => t.temaId === 'comida')!;
    expect(comida.previstoMinor).toBe(300000);
    expect(comida.realMinor).toBe(70000);
    expect(comida.diffMinor).toBe(230000);

    const moto = s.temas.find(t => t.temaId === 'moto')!;
    expect(moto.realMinor).toBe(220000);
    expect(moto.diffMinor).toBe(-20000);
    expect(moto.pct).toBeCloseTo(1.1);

    expect(s.grandRealMinor).toBe(70000 + 220000);
  });

  it('lists subtemas with movements but no budget under sinPresupuesto only if unknown', async () => {
    await createMovement({
      kind: 'gasto', date: '2026-07-01', description: 'Snacks',
      amount: 5000, currency: 'COP', accountId: 'a', subtemaId: 'comida--snacks',
    });
    const s = await computeMonthSummary('2026-07', 'COP');
    const comida = s.temas.find(t => t.temaId === 'comida')!;
    const snacks = comida.subtemas.find(x => x.subtemaId === 'comida--snacks')!;
    expect(snacks.previstoMinor).toBe(0);
    expect(snacks.realMinor).toBe(5000);
    expect(snacks.pct).toBeNull();
    expect(s.sinPresupuesto).toEqual([]);
  });

  it('ignores movements from other months or currencies', async () => {
    await createMovement({
      kind: 'gasto', date: '2026-06-30', description: 'Prev mes',
      amount: 99999, currency: 'COP', accountId: 'a', subtemaId: 'comida--rest',
    });
    await db.accounts.put({ id: 'brl', name: 'BR', currency: 'BRL', createdAt: new Date().toISOString() });
    await createMovement({
      kind: 'gasto', date: '2026-07-01', description: 'BRL',
      amount: 50, currency: 'BRL', accountId: 'brl', subtemaId: 'comida--rest',
    });
    const s = await computeMonthSummary('2026-07', 'COP');
    const comida = s.temas.find(t => t.temaId === 'comida')!;
    expect(comida.realMinor).toBe(0);
    expect(s.availableCurrencies).toEqual(expect.arrayContaining(['COP', 'BRL']));
  });
});
