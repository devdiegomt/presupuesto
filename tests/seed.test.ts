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

/**
 * Regresión del bug que duplicó los datos en producción: los movimientos usaban
 * ULID aleatorio, así que cada import creaba filas "nuevas" para el sync y dos
 * dispositivos importando el mismo archivo dejaban el doble de movimientos en
 * el servidor.
 */
describe('el import es idempotente', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('derivar el id del legacyId lo hace determinista', async () => {
    await importSeed(sample);
    const ids = (await db.movements.toArray()).map(m => m.id).sort();
    expect(ids).toEqual(['seed-1', 'seed-2', 'seed-3']);
  });

  it('importar dos veces no duplica', async () => {
    await importSeed(sample);
    const primera = await db.movements.count();

    await importSeed(sample);
    const segunda = await db.movements.count();

    expect(primera).toBe(3);
    expect(segunda).toBe(3);
  });

  it('dos dispositivos que importan el mismo archivo generan los mismos ids', async () => {
    await importSeed(sample);
    const dispositivoA = (await db.movements.toArray()).map(m => m.id).sort();

    // "Dispositivo B": base desde cero, mismo archivo.
    await db.delete();
    await db.open();
    await importSeed(sample);
    const dispositivoB = (await db.movements.toArray()).map(m => m.id).sort();

    // Con ULIDs esto fallaba: 6 ids distintos y el servidor se quedaba con los
    // dos juegos.
    expect(dispositivoB).toEqual(dispositivoA);
  });

  it('respeta los ids que ya existan localmente (bases de la versión anterior)', async () => {
    // Base que ya tenía el archivo importado con los ULIDs viejos.
    const now = new Date().toISOString();
    await db.movements.put({
      id: '01KY8FN8M577S2XXVDEC6JMR67',
      legacyId: 1,
      date: '2026-01-05', month: '2026-01', description: 'Nómina',
      currency: 'COP', amountMinor: 3000000, kind: 'ingreso',
      createdAt: now, updatedAt: now,
    });

    await importSeed(sample);

    // El movimiento legacyId=1 conserva su ULID en vez de crear un 'seed-1'
    // que sería un duplicado del mismo hecho.
    expect(await db.movements.get('01KY8FN8M577S2XXVDEC6JMR67')).toBeDefined();
    expect(await db.movements.get('seed-1')).toBeUndefined();
    expect(await db.movements.count()).toBe(3);
  });
});
