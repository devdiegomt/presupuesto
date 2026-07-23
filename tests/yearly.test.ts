import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { createMovement } from '@/domain/movements';
import { closeMonth } from '@/domain/closures';
import { computeYearSummary } from '@/domain/yearly';

beforeEach(async () => {
  await db.delete();
  await db.open();
  const now = new Date().toISOString();
  await db.accounts.bulkPut([
    { id: 'davi', name: 'Davivienda', currency: 'COP', createdAt: now },
    { id: 'brl', name: 'Efectivo BRL', currency: 'BRL', createdAt: now },
  ]);
  await db.temas.bulkPut([
    { id: 'comida', name: 'Comida' },
    { id: 'moto', name: 'Moto' },
  ]);
  await db.subtemas.bulkPut([
    { id: 'comida--rest', name: 'Restaurantes', temaId: 'comida' },
    { id: 'moto--gasolina', name: 'Gasolina', temaId: 'moto' },
  ]);
});

describe('computeYearSummary', () => {
  it('rolls up movements per month and shows closure marker', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'Salario',
      amount: 3000000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-01-10', description: 'Almuerzo',
      amount: 25000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-02-15', description: 'Gasolina',
      amount: 60000, currency: 'COP', accountId: 'davi', subtemaId: 'moto--gasolina',
    });
    await closeMonth('2026-01', 'COP');

    const s = await computeYearSummary('2026', 'COP');
    expect(s.months).toHaveLength(12);
    const jan = s.months[0]!;
    expect(jan.ingresoMinor).toBe(3000000);
    expect(jan.gastoMinor).toBe(25000);
    expect(jan.netoMinor).toBe(3000000 - 25000);
    expect(jan.closedAt).toBeDefined();

    const feb = s.months[1]!;
    expect(feb.gastoMinor).toBe(60000);
    expect(feb.closedAt).toBeUndefined();

    expect(s.totalIngresoMinor).toBe(3000000);
    expect(s.totalGastoMinor).toBe(85000);
    expect(s.totalNetoMinor).toBe(3000000 - 85000);
  });

  it('temas ranked by real desc with share%', async () => {
    await createMovement({
      kind: 'gasto', date: '2026-03-01', description: 'r',
      amount: 100000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-03-02', description: 'g',
      amount: 300000, currency: 'COP', accountId: 'davi', subtemaId: 'moto--gasolina',
    });
    const s = await computeYearSummary('2026', 'COP');
    expect(s.temas.map(t => t.name)).toEqual(['Moto', 'Comida']);
    expect(s.temas[0]!.realMinor).toBe(300000);
    expect(s.temas[0]!.share).toBeCloseTo(0.75, 3);
  });

  it('per-account saldos snapshot end of each month', async () => {
    await createMovement({
      kind: 'ingreso', date: '2026-01-05', description: 'x',
      amount: 1000000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-03-05', description: 'y',
      amount: 200000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    const s = await computeYearSummary('2026', 'COP');
    const davi = s.accounts.find(a => a.accountId === 'davi')!;
    expect(davi.monthlySaldos[0]).toBe(1000000);
    expect(davi.monthlySaldos[1]).toBe(1000000);
    expect(davi.monthlySaldos[2]).toBe(800000);
    expect(davi.monthlySaldos[11]).toBe(800000);
  });

  it('filters by year and currency', async () => {
    await createMovement({
      kind: 'gasto', date: '2025-12-31', description: 'año pasado',
      amount: 500000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'año actual',
      amount: 100000, currency: 'COP', accountId: 'davi', subtemaId: 'comida--rest',
    });
    await createMovement({
      kind: 'gasto', date: '2026-01-02', description: 'br',
      amount: 50, currency: 'BRL', accountId: 'brl', subtemaId: 'comida--rest',
    });
    const s = await computeYearSummary('2026', 'COP');
    expect(s.totalGastoMinor).toBe(100000);
    expect(s.availableYears).toEqual(expect.arrayContaining(['2025', '2026']));
  });
});
