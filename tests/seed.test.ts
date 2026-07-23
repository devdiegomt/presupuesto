import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { importSeed } from '@/import/seed';
import { computeBalances } from '@/domain/balances';

const sample = {
  meta: {
    source: 'test.ods',
    generated: '2026-07-22',
    months: ['2026-01'],
    movements_count: 3,
  },
  accounts: [
    { id: 'davivienda', name: 'Davivienda', currency: 'COP' as const },
    { id: 'efectivo', name: 'Efectivo', currency: 'COP' as const },
  ],
  catalog: {
    temas: ['Comida', 'Ingreso 1'],
    subtemas: [
      { name: 'Restaurantes', tema: 'Comida' },
      { name: 'Ingreso principal', tema: 'Ingreso 1' },
    ],
  },
  movements: [
    {
      id: 1,
      month: '2026-01',
      date: '2026-01-05',
      description: 'Nómina',
      amount: 3000000,
      currency: 'COP' as const,
      tema: 'Ingreso 1',
      subtema: 'Ingreso principal',
      account: 'Davivienda',
      transfer: null,
      flags: [],
      kind: 'ingreso',
    },
    {
      id: 2,
      month: '2026-01',
      date: '2026-01-06',
      description: 'Retiro',
      amount: -200000,
      currency: 'COP' as const,
      tema: null,
      subtema: 'Retiro',
      account: null,
      transfer: { from: 'Davivienda', to: 'Efectivo', amount: 200000 },
      flags: [],
      kind: 'transferencia',
    },
    {
      id: 3,
      month: '2026-01',
      date: '2026-01-07',
      description: 'Almuerzo',
      amount: -25000,
      currency: 'COP' as const,
      tema: 'Comida',
      subtema: 'Restaurantes',
      account: 'Efectivo',
      transfer: null,
      flags: [],
      kind: 'gasto',
    },
  ],
  budgets: [
    { month: '2026-01', subtema: 'Restaurantes', tema: 'Comida', previsto: 300000 },
  ],
};

describe('importSeed + balances', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('normalizes catalog and computes balances', async () => {
    const res = await importSeed(sample);
    expect(res.counts.movements).toBe(3);
    expect(res.counts.subtemas).toBe(2);

    const balances = await computeBalances();
    const dav = balances.find(b => b.accountId === 'davivienda')!;
    const efe = balances.find(b => b.accountId === 'efectivo')!;

    expect(dav.balanceMinor).toBe(3000000 - 200000);
    expect(efe.balanceMinor).toBe(200000 - 25000);
  });

  it('records issues for unknown subtemas on gasto/ingreso', async () => {
    const bad = {
      ...sample,
      movements: [
        {
          ...sample.movements[2]!,
          id: 99,
          subtema: 'NoExiste',
        },
      ],
    };
    const res = await importSeed(bad);
    expect(res.issues).toBeGreaterThan(0);
  });
});
