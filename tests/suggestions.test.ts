import { describe, expect, it } from 'vitest';
import { findAutofillSource, rankDescriptions } from '@/domain/suggestions';
import type { Movement } from '@/db/types';

const H = [
  { text: 'Almuerzo', date: '2026-07-20' },
  { text: 'Almuerzo', date: '2026-07-21' },
  { text: 'Almuerzo', date: '2026-07-22' },
  { text: 'Almuerzo con Ana', date: '2026-07-10' },
  { text: 'Almuerzo con Ana', date: '2026-07-15' },
  { text: 'Café', date: '2026-07-22' },
  { text: 'Café', date: '2026-07-20' },
  { text: 'Cine', date: '2026-06-01' },
  { text: 'Peluquería', date: '2026-05-01' },
  { text: 'Almacén', date: '2026-07-19' },
];

describe('rankDescriptions', () => {
  it('empty query ranks by frequency then recency (ties broken by newest date)', () => {
    const r = rankDescriptions(H, '', 3);
    // Almuerzo count=3 wins. Café and "Almuerzo con Ana" tie count=2;
    // Café's newest date (2026-07-22) beats "Almuerzo con Ana" (2026-07-15).
    expect(r).toEqual(['Almuerzo', 'Café', 'Almuerzo con Ana']);
  });

  it('prefix match beats substring match', () => {
    const r = rankDescriptions(H, 'alm', 5);
    // "Almuerzo", "Almuerzo con Ana", "Almacén" start with alm; "Alma..." wait none other.
    expect(r[0]).toBe('Almuerzo');
    expect(r.slice(0, 3)).toEqual(expect.arrayContaining(['Almuerzo', 'Almuerzo con Ana', 'Almacén']));
  });

  it('accent-insensitive', () => {
    const r = rankDescriptions(H, 'cafe', 3);
    expect(r).toContain('Café');
    const r2 = rankDescriptions(H, 'CAFÉ', 3);
    expect(r2).toContain('Café');
  });

  it('substring still counts when no prefix hit', () => {
    const r = rankDescriptions(H, 'ana', 3);
    expect(r).toContain('Almuerzo con Ana');
  });

  it('excludes empty descriptions', () => {
    const r = rankDescriptions([{ text: '  ', date: '2026-01-01' }, { text: 'X', date: '2026-01-02' }], '', 5);
    expect(r).toEqual(['X']);
  });

  it('respects limit', () => {
    const r = rankDescriptions(H, '', 2);
    expect(r).toHaveLength(2);
  });
});

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

describe('findAutofillSource', () => {
  const movs = [
    m({ id: '1', date: '2026-05-01', description: 'Almuerzo',
        kind: 'gasto', accountId: 'davi', subtemaId: 'comida--rest' }),
    m({ id: '2', date: '2026-07-01', description: 'Almuerzo',
        kind: 'gasto', accountId: 'efectivo', subtemaId: 'comida--rest' }),
    m({ id: '3', date: '2026-07-15', description: 'Café',
        kind: 'gasto', accountId: 'nequi', subtemaId: 'comida--snacks' }),
    m({ id: '4', date: '2026-06-01', description: 'Almuerzo',
        kind: 'ingreso', accountId: 'davi', subtemaId: 'ingreso--devolucion' }),
  ];

  it('returns most recent match for the same kind', () => {
    const r = findAutofillSource(movs, 'Almuerzo', 'gasto');
    expect(r).toEqual({ subtemaId: 'comida--rest', accountId: 'efectivo' });
  });

  it('kind filter separates gasto from ingreso with same description', () => {
    const r = findAutofillSource(movs, 'Almuerzo', 'ingreso');
    expect(r).toEqual({ subtemaId: 'ingreso--devolucion', accountId: 'davi' });
  });

  it('accent-insensitive matching', () => {
    const r = findAutofillSource(movs, 'CAFÉ', 'gasto');
    expect(r).toEqual({ subtemaId: 'comida--snacks', accountId: 'nequi' });
  });

  it('returns null when nothing matches', () => {
    const r = findAutofillSource(movs, 'Peluquería', 'gasto');
    expect(r).toBeNull();
  });

  it('skips movements without account nor subtema', () => {
    const only = [
      m({ id: 'x', date: '2026-08-01', description: 'Y', kind: 'gasto' }),
      m({ id: 'y', date: '2026-06-01', description: 'Y', kind: 'gasto', accountId: 'davi' }),
    ];
    const r = findAutofillSource(only, 'Y', 'gasto');
    expect(r).toEqual({ subtemaId: undefined, accountId: 'davi' });
  });
});
