import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import {
  accountUsage,
  createAccount,
  deleteAccount,
  updateAccount,
} from '@/domain/accounts';
import {
  createSubtema,
  createTema,
  deleteSubtema,
  deleteTema,
  renameTema,
  subtemaUsage,
  updateSubtema,
} from '@/domain/catalog';
import { createMovement } from '@/domain/movements';
import { upsertBudget } from '@/domain/budgets';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('accounts domain', () => {
  it('creates with slugged id and avoids collisions', async () => {
    const a = await createAccount({ name: 'Nequi', currency: 'COP' });
    const b = await createAccount({ name: 'Nequi', currency: 'COP' });
    expect(a.id).toBe('nequi');
    expect(b.id).toBe('nequi-2');
  });

  it('updateAccount trims name and toggles archived', async () => {
    const a = await createAccount({ name: 'Nu', currency: 'COP' });
    const u = await updateAccount(a.id, { name: '  Nu Bank  ', archived: true });
    expect(u.name).toBe('Nu Bank');
    expect(u.archived).toBe(true);
  });

  it('accountUsage counts gasto/ingreso/from/to', async () => {
    const a = await createAccount({ name: 'A', currency: 'COP' });
    const b = await createAccount({ name: 'B', currency: 'COP' });
    const t = await createTema('X');
    const s = await createSubtema('Y', t.id);
    await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'g',
      amount: 1000, currency: 'COP', accountId: a.id, subtemaId: s.id,
    });
    await createMovement({
      kind: 'transferencia', date: '2026-01-02', description: 't',
      amount: 2000, currency: 'COP', fromAccountId: a.id, toAccountId: b.id,
    });
    expect(await accountUsage(a.id)).toBe(2);
    expect(await accountUsage(b.id)).toBe(1);
  });

  it('deleteAccount blocks if used, succeeds if empty', async () => {
    const a = await createAccount({ name: 'A', currency: 'COP' });
    const t = await createTema('X');
    const s = await createSubtema('Y', t.id);
    await createMovement({
      kind: 'gasto', date: '2026-01-01', description: 'g',
      amount: 1000, currency: 'COP', accountId: a.id, subtemaId: s.id,
    });
    await expect(deleteAccount(a.id)).rejects.toThrow(/movimientos/);
    const b = await createAccount({ name: 'B', currency: 'COP' });
    await deleteAccount(b.id);
    expect(await db.accounts.get(b.id)).toBeUndefined();
  });
});

describe('catalog domain', () => {
  it('renameTema keeps id and subtemas relations', async () => {
    const t = await createTema('Comida');
    const s = await createSubtema('Restaurantes', t.id);
    const renamed = await renameTema(t.id, 'Alimentación');
    expect(renamed.id).toBe(t.id);
    expect((await db.subtemas.get(s.id))!.temaId).toBe(t.id);
  });

  it('deleteTema blocks if it has subtemas', async () => {
    const t = await createTema('Comida');
    await createSubtema('X', t.id);
    await expect(deleteTema(t.id)).rejects.toThrow(/subtemas/);
  });

  it('updateSubtema moves without changing its id', async () => {
    const t1 = await createTema('Comida');
    const t2 = await createTema('Salud');
    const s = await createSubtema('Suplementos', t1.id);
    const moved = await updateSubtema(s.id, { temaId: t2.id });
    expect(moved.id).toBe(s.id);
    expect(moved.temaId).toBe(t2.id);
  });

  it('subtemaUsage counts movements + budgets; delete respects them', async () => {
    const a = await createAccount({ name: 'A', currency: 'COP' });
    const t = await createTema('X');
    const s = await createSubtema('Y', t.id);
    await upsertBudget('2026-01', s.id, 100000, 'COP');
    await createMovement({
      kind: 'gasto', date: '2026-01-05', description: 'g',
      amount: 10000, currency: 'COP', accountId: a.id, subtemaId: s.id,
    });
    const use = await subtemaUsage(s.id);
    expect(use.movements).toBe(1);
    expect(use.budgets).toBe(1);
    await expect(deleteSubtema(s.id)).rejects.toThrow();

    const s2 = await createSubtema('Z', t.id);
    await deleteSubtema(s2.id);
    expect(await db.subtemas.get(s2.id)).toBeUndefined();
  });
});
