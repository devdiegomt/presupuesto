import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import {
  bulkAssignAccount,
  bulkAssignSubtema,
  dismissAll,
  dismissByKind,
  dismissIssue,
  extractQuoted,
  groupUnknownSubtemaIssues,
} from '@/domain/incidents';
import { createMovement } from '@/domain/movements';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.importIssues.bulkAdd([
    { importId: 'imp1', kind: 'unknown-subtema', detail: 'Retiro no está en catálogo' },
    { importId: 'imp1', kind: 'unknown-subtema', detail: 'Abono no está en catálogo' },
    { importId: 'imp1', kind: 'account-missing', movementLegacyId: 42, detail: 'Cuenta X' },
    { importId: 'imp1', kind: 'flag', movementLegacyId: 7, detail: 'delta != movimiento' },
    { importId: 'imp1', kind: 'tema-mismatch', movementLegacyId: 8, detail: 'catálogo dice otro' },
  ]);
});

describe('incidents dismissal', () => {
  it('dismissIssue removes one by id', async () => {
    const all = await db.importIssues.toArray();
    const target = all[0]!;
    await dismissIssue(target.id!);
    expect(await db.importIssues.count()).toBe(4);
    expect(await db.importIssues.get(target.id!)).toBeUndefined();
  });

  it('dismissByKind removes all of a kind', async () => {
    const n = await dismissByKind('unknown-subtema');
    expect(n).toBe(2);
    expect(await db.importIssues.count()).toBe(3);
    expect(await db.importIssues.where('kind').equals('unknown-subtema').count()).toBe(0);
  });

  it('dismissAll clears everything', async () => {
    const n = await dismissAll();
    expect(n).toBe(5);
    expect(await db.importIssues.count()).toBe(0);
  });
});

describe('bulk reassign', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    const now = new Date().toISOString();
    await db.accounts.bulkPut([
      { id: 'davi', name: 'Davivienda', currency: 'COP', createdAt: now },
      { id: 'nequi', name: 'Nequi', currency: 'COP', createdAt: now },
      { id: 'brl', name: 'BR', currency: 'BRL', createdAt: now },
    ]);
    await db.temas.put({ id: 'moto', name: 'Moto' });
    await db.subtemas.put({ id: 'moto--gasolina', name: 'Gasolina', temaId: 'moto' });
  });

  it('extractQuoted pulls the first quoted token', () => {
    expect(extractQuoted('Subtema "Retiro" no está en el catálogo')).toBe('Retiro');
    expect(extractQuoted('Cuenta desconocida "Bancolombia"')).toBe('Bancolombia');
    expect(extractQuoted('sin comillas')).toBeUndefined();
  });

  it('groupUnknownSubtemaIssues groups by raw name and counts movement vs budget-only', async () => {
    await db.importIssues.bulkAdd([
      { importId: 'i', kind: 'unknown-subtema', detail: 'Subtema "Retiro" no está en el catálogo', movementLegacyId: 1 },
      { importId: 'i', kind: 'unknown-subtema', detail: 'Subtema "Retiro" no está en el catálogo', movementLegacyId: 2 },
      { importId: 'i', kind: 'unknown-subtema', detail: 'Presupuesto 2026-01: subtema "Retiro" no está en catálogo' },
      { importId: 'i', kind: 'unknown-subtema', detail: 'Subtema "Abono" no está en el catálogo', movementLegacyId: 3 },
    ]);
    const issues = await db.importIssues.toArray();
    const groups = groupUnknownSubtemaIssues(issues);
    expect(groups).toHaveLength(2);
    const retiro = groups.find(g => g.rawName === 'Retiro')!;
    expect(retiro.issues).toHaveLength(3);
    expect(retiro.withMovement).toBe(2);
    expect(retiro.budgetOnly).toBe(1);
  });

  it('bulkAssignSubtema fills subtemaId on matching gasto/ingreso and dismisses all', async () => {
    const g = await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'x',
      amount: 10000, currency: 'COP', accountId: 'davi', subtemaId: 'moto--gasolina',
    });
    await db.movements.put({ ...g, legacyId: 100, subtemaId: undefined });

    await db.importIssues.bulkAdd([
      { importId: 'i', kind: 'unknown-subtema', detail: 'Subtema "Foo" no está en el catálogo', movementLegacyId: 100 },
      { importId: 'i', kind: 'unknown-subtema', detail: 'Presupuesto: subtema "Foo" no está en catálogo' },
    ]);

    const r = await bulkAssignSubtema('Foo', 'moto--gasolina');
    expect(r.movementsUpdated).toBe(1);
    expect(r.issuesDismissed).toBe(2);
    expect(r.skipped).toBe(1);   // budget-only issue can't be applied to a movement

    const fresh = await db.movements.get(g.id);
    expect(fresh!.subtemaId).toBe('moto--gasolina');
    expect(await db.importIssues.count()).toBe(0);
  });

  it('bulkAssignAccount fills fromAccountId/toAccountId based on which is missing; respects currency', async () => {
    const now = new Date().toISOString();
    // Transferencia sin fromAccountId
    await db.movements.put({
      id: 'x1', date: '2026-01-01', month: '2026-01', description: 't', currency: 'COP',
      amountMinor: 500000, kind: 'transferencia', toAccountId: 'nequi', legacyId: 200,
      createdAt: now, updatedAt: now,
    });
    // Gasto sin cuenta
    await db.movements.put({
      id: 'x2', date: '2026-01-02', month: '2026-01', description: 'g', currency: 'COP',
      amountMinor: -25000, kind: 'gasto', subtemaId: 'moto--gasolina', legacyId: 201,
      createdAt: now, updatedAt: now,
    });
    // Gasto BRL — no debe recibir cuenta COP
    await db.movements.put({
      id: 'x3', date: '2026-01-03', month: '2026-01', description: 'brl', currency: 'BRL',
      amountMinor: -5000, kind: 'gasto', subtemaId: 'moto--gasolina', legacyId: 202,
      createdAt: now, updatedAt: now,
    });
    await db.importIssues.bulkAdd([
      { importId: 'i', kind: 'account-missing', detail: 'Cuenta desconocida "Bancolombia"', movementLegacyId: 200 },
      { importId: 'i', kind: 'account-missing', detail: 'Cuenta desconocida "Bancolombia"', movementLegacyId: 201 },
      { importId: 'i', kind: 'account-missing', detail: 'Cuenta desconocida "Bancolombia"', movementLegacyId: 202 },
    ]);

    const r = await bulkAssignAccount('Bancolombia', 'davi');
    expect(r.movementsUpdated).toBe(2);
    expect(r.issuesDismissed).toBe(3);
    expect(r.skipped).toBe(1);

    expect((await db.movements.get('x1'))!.fromAccountId).toBe('davi');
    expect((await db.movements.get('x2'))!.accountId).toBe('davi');
    expect((await db.movements.get('x3'))!.accountId).toBeUndefined();  // currency guard
  });
});
