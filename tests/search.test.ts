import { describe, expect, it } from 'vitest';
import { filterMovements, summarize, type SearchIndex } from '@/domain/search';
import type { Movement } from '@/db/types';

const idx: SearchIndex = {
  accountName: new Map([
    ['davi', 'Davivienda'],
    ['nequi', 'Nequi'],
    ['brl', 'Efectivo BRL'],
  ]),
  subtemaName: new Map([
    ['comida--rest', 'Restaurantes'],
    ['moto--gasolina', 'Gasolina'],
  ]),
  temaIdBySubtema: new Map([
    ['comida--rest', 'comida'],
    ['moto--gasolina', 'moto'],
  ]),
  temaName: new Map([
    ['comida', 'Comida'],
    ['moto', 'Moto'],
  ]),
};

function m(overrides: Partial<Movement>): Movement {
  const base: Movement = {
    id: overrides.id ?? Math.random().toString(),
    date: '2026-01-01',
    month: '2026-01',
    description: '',
    currency: 'COP',
    amountMinor: 0,
    kind: 'gasto',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  return { ...base, ...overrides };
}

const H = [
  m({ id: '1', date: '2026-07-10', month: '2026-07', description: 'Almuerzo con Ana',
       kind: 'gasto', amountMinor: -25000, accountId: 'davi', subtemaId: 'comida--rest' }),
  m({ id: '2', date: '2026-07-11', month: '2026-07', description: 'Gasolina',
       kind: 'gasto', amountMinor: -60000, accountId: 'davi', subtemaId: 'moto--gasolina' }),
  m({ id: '3', date: '2026-07-15', month: '2026-07', description: 'Salario',
       kind: 'ingreso', amountMinor: 3000000, accountId: 'davi' }),
  m({ id: '4', date: '2026-07-20', month: '2026-07', description: 'Retiro',
       kind: 'transferencia', amountMinor: 200000, fromAccountId: 'davi', toAccountId: 'nequi' }),
  m({ id: '5', date: '2026-07-22', month: '2026-07', description: 'Cena en Buenos Aires',
       kind: 'gasto', amountMinor: -5000, currency: 'BRL', accountId: 'brl', subtemaId: 'comida--rest' }),
];

const empty = { q: '', currency: 'all' as const, kind: 'all' as const };

describe('filterMovements', () => {
  it('returns all sorted by date desc when no filters', () => {
    const r = filterMovements(H, empty, idx);
    expect(r.map(x => x.id)).toEqual(['5', '4', '3', '2', '1']);
  });

  it('matches description', () => {
    const r = filterMovements(H, { ...empty, q: 'almuerzo' }, idx);
    expect(r.map(x => x.id)).toEqual(['1']);
  });

  it('matches subtema name and tema name (accent-insensitive)', () => {
    const r = filterMovements(H, { ...empty, q: 'comida' }, idx);
    expect(r.map(x => x.id).sort()).toEqual(['1', '5']);
  });

  it('matches account name for both direct and transfer sides', () => {
    const r = filterMovements(H, { ...empty, q: 'nequi' }, idx);
    expect(r.map(x => x.id)).toEqual(['4']);
  });

  it('respects currency filter', () => {
    const r = filterMovements(H, { ...empty, currency: 'BRL' }, idx);
    expect(r.map(x => x.id)).toEqual(['5']);
  });

  it('respects kind filter', () => {
    const r = filterMovements(H, { ...empty, kind: 'transferencia' }, idx);
    expect(r.map(x => x.id)).toEqual(['4']);
  });

  it('respects date range', () => {
    const r = filterMovements(H, { ...empty, fromDate: '2026-07-15', toDate: '2026-07-20' }, idx);
    expect(r.map(x => x.id)).toEqual(['4', '3']);
  });

  it('summarize groups by currency and sums signed nets', () => {
    const r = filterMovements(H, empty, idx);
    const s = summarize(r);
    expect(s.count).toBe(5);
    const cop = s.byCurrency.find(x => x.currency === 'COP')!;
    expect(cop.count).toBe(4);
    expect(cop.gastoMinor).toBe(85000);
    expect(cop.ingresoMinor).toBe(3000000);
    // net = ingresos - gastos (transferencia excluida)
    expect(cop.netMinor).toBe(3000000 - 25000 - 60000);
    const brl = s.byCurrency.find(x => x.currency === 'BRL')!;
    expect(brl.gastoMinor).toBe(5000);
    expect(brl.netMinor).toBe(-5000);
  });
});
