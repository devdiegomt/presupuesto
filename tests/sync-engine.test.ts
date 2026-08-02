import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Supabase falso en memoria: replica lo justo de la API fluida que usa
 * src/lib/sync.ts (upsert con onConflict, y select con eq/gt/order/range).
 *
 * Existe para poder probar lo que de verdad puede salir mal —merge LWW,
 * tombstones, avance del cursor— sin depender de la red.
 */
interface FakeRow {
  user_id: string;
  table_name: string;
  sync_id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
}

const store: FakeRow[] = [];

function makeFake() {
  return {
    from(_table: string) {
      return {
        upsert(batch: FakeRow[], _opts: unknown) {
          for (const row of batch) {
            const i = store.findIndex(
              r =>
                r.user_id === row.user_id &&
                r.table_name === row.table_name &&
                r.sync_id === row.sync_id,
            );
            if (i >= 0) store[i] = { ...row };
            else store.push({ ...row });
          }
          return Promise.resolve({ error: null });
        },
        select(_cols: string) {
          const filters: { user?: string; table?: string; since?: string } = {};
          const builder = {
            eq(col: string, val: string) {
              if (col === 'user_id') filters.user = val;
              if (col === 'table_name') filters.table = val;
              return builder;
            },
            gt(_col: string, val: string) {
              filters.since = val;
              return builder;
            },
            order() {
              return builder;
            },
            range(from: number, to: number) {
              const rows = store
                .filter(
                  r =>
                    r.user_id === filters.user &&
                    r.table_name === filters.table &&
                    r.updated_at > (filters.since ?? ''),
                )
                .sort(
                  (a, b) =>
                    a.updated_at.localeCompare(b.updated_at) ||
                    a.sync_id.localeCompare(b.sync_id),
                );
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => makeFake(),
  isSupabaseConfigured: () => true,
}));

// localStorage no existe en el entorno 'node' de vitest y el motor lo usa para
// los cursores.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
});

const { db } = await import('@/db/schema');
const { installSyncHooks } = await import('@/db/hooks');
const { pushAll, pullAll, syncAll, getSyncState, resetAllSyncCursors } =
  await import('@/lib/sync');
const { createMovement, deleteMovement } = await import('@/domain/movements');
const { createAccount } = await import('@/domain/accounts');
const { createSubtema, createTema } = await import('@/domain/catalog');

installSyncHooks();

const USER = 'user-1';

async function seedCatalog() {
  const t = await createTema('Comida');
  const s = await createSubtema('Restaurantes', t.id);
  const a = await createAccount({ name: 'Efectivo', currency: 'COP' });
  return { temaId: t.id, subtemaId: s.id, accountId: a.id };
}

beforeEach(async () => {
  store.length = 0;
  mem.clear();
  await db.delete();
  await db.open();
});

describe('push', () => {
  it('sube las filas locales con table_name namespaceado', async () => {
    const { subtemaId, accountId } = await seedCatalog();
    await createMovement({
      kind: 'gasto', date: '2026-01-05', description: 'Almuerzo',
      amount: 25000, currency: 'COP', accountId, subtemaId,
    });

    const report = await pushAll(USER);
    expect(report.ok).toBe(true);

    const names = [...new Set(store.map(r => r.table_name))].sort();
    expect(names).toEqual([
      'presupuesto:accounts',
      'presupuesto:movements',
      'presupuesto:subtemas',
      'presupuesto:temas',
    ]);

    const mov = store.find(r => r.table_name === 'presupuesto:movements')!;
    expect(mov.data.description).toBe('Almuerzo');
    expect(mov.data.amountMinor).toBe(-25000);
    // updatedAt vive en su columna, no duplicado dentro del JSONB
    expect(mov.data.updatedAt).toBeUndefined();
    expect(mov.updated_at).toBeTruthy();
  });

  it('el segundo push no reenvía lo que no cambió', async () => {
    await seedCatalog();
    const first = await pushAll(USER);
    expect(first.totalPushed).toBeGreaterThan(0);

    const second = await pushAll(USER);
    expect(second.totalPushed).toBe(0);
  });

  it('un delete local viaja como tombstone y limpia la cola', async () => {
    const { subtemaId, accountId } = await seedCatalog();
    const m = await createMovement({
      kind: 'gasto', date: '2026-01-05', description: 'x',
      amount: 1000, currency: 'COP', accountId, subtemaId,
    });
    await pushAll(USER);
    await deleteMovement(m.id);

    const report = await pushAll(USER);
    expect(report.tombstonesPushed).toBe(1);
    expect(await db.syncTombstones.count()).toBe(0);

    const remote = store.find(r => r.sync_id === m.id)!;
    expect(remote.deleted_at).not.toBeNull();
  });
});

describe('pull', () => {
  it('baja filas remotas que no existen localmente', async () => {
    store.push({
      user_id: USER,
      table_name: 'presupuesto:accounts',
      sync_id: 'nequi',
      data: { id: 'nequi', name: 'Nequi', currency: 'COP', createdAt: '2026-01-01T00:00:00.000Z' },
      updated_at: '2026-01-02T00:00:00.000Z',
      deleted_at: null,
    });

    const report = await pullAll(USER);
    expect(report.totalApplied).toBe(1);

    const acc = await db.accounts.get('nequi');
    expect(acc!.name).toBe('Nequi');
    // El updatedAt aplicado es el REMOTO, no "ahora": si no, la fila quedaría
    // marcada como recién editada y se re-subiría en el push siguiente.
    expect(acc!.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('last-write-wins: el remoto más nuevo pisa al local', async () => {
    const acc = await createAccount({ name: 'Viejo', currency: 'COP' });
    store.push({
      user_id: USER,
      table_name: 'presupuesto:accounts',
      sync_id: acc.id,
      data: { id: acc.id, name: 'Nuevo', currency: 'COP', createdAt: acc.createdAt },
      updated_at: '2099-01-01T00:00:00.000Z',
      deleted_at: null,
    });

    await pullAll(USER);
    expect((await db.accounts.get(acc.id))!.name).toBe('Nuevo');
  });

  it('last-write-wins: el local más nuevo gana y no se toca', async () => {
    const acc = await createAccount({ name: 'Local gana', currency: 'COP' });
    store.push({
      user_id: USER,
      table_name: 'presupuesto:accounts',
      sync_id: acc.id,
      data: { id: acc.id, name: 'Remoto viejo', currency: 'COP', createdAt: acc.createdAt },
      updated_at: '2000-01-01T00:00:00.000Z',
      deleted_at: null,
    });

    const report = await pullAll(USER);
    expect((await db.accounts.get(acc.id))!.name).toBe('Local gana');
    expect(report.perTable.accounts!.skipped).toBe(1);
  });

  it('un tombstone remoto borra localmente sin encolar uno nuevo', async () => {
    const acc = await createAccount({ name: 'Condenada', currency: 'COP' });
    store.push({
      user_id: USER,
      table_name: 'presupuesto:accounts',
      sync_id: acc.id,
      data: {},
      updated_at: '2099-01-01T00:00:00.000Z',
      deleted_at: '2099-01-01T00:00:00.000Z',
    });

    const report = await pullAll(USER);
    expect(report.totalDeleted).toBe(1);
    expect(await db.accounts.get(acc.id)).toBeUndefined();
    // Clave: si esto fuera > 0, el borrado remoto rebotaría al servidor.
    expect(await db.syncTombstones.count()).toBe(0);
  });

  it('el cursor avanza al updated_at más alto visto, no a la hora de arranque', async () => {
    store.push({
      user_id: USER,
      table_name: 'presupuesto:accounts',
      sync_id: 'x',
      data: { id: 'x', name: 'X', currency: 'COP', createdAt: '2026-01-01T00:00:00.000Z' },
      updated_at: '2026-06-15T12:00:00.000Z',
      deleted_at: null,
    });
    await pullAll(USER);
    expect(mem.get(`presupuesto:sync:lastPull:${USER}`)).toBe('2026-06-15T12:00:00.000Z');

    // Un segundo pull sin novedades no debe reaplicar nada.
    const again = await pullAll(USER);
    expect(again.totalApplied).toBe(0);
  });
});

describe('round-trip entre dos dispositivos', () => {
  it('lo que sube A lo baja B idéntico', async () => {
    const { subtemaId, accountId } = await seedCatalog();
    const m = await createMovement({
      kind: 'gasto', date: '2026-03-10', description: 'Cena',
      amount: 45000, currency: 'COP', accountId, subtemaId,
    });
    await pushAll(USER);

    // "Dispositivo B": misma base vacía, mismos datos remotos.
    await db.delete();
    await db.open();
    resetAllSyncCursors();

    const report = await pullAll(USER);
    expect(report.ok).toBe(true);

    const got = await db.movements.get(m.id);
    expect(got).toBeDefined();
    expect(got!.description).toBe('Cena');
    expect(got!.amountMinor).toBe(-45000);
    expect(got!.accountId).toBe(accountId);
    expect(got!.subtemaId).toBe(subtemaId);
    expect(await db.accounts.get(accountId)).toBeDefined();
    expect(await db.subtemas.get(subtemaId)).toBeDefined();
  });

  it('un dispositivo nuevo no re-sube lo que acaba de bajar', async () => {
    await seedCatalog();
    await pushAll(USER);
    const remoteBefore = store.length;

    // "Dispositivo B" limpio.
    await db.delete();
    await db.open();
    resetAllSyncCursors();

    const { pull, push } = await syncAll(USER);
    expect(pull.totalApplied).toBe(remoteBefore);
    // Lo importante: bajó 3 filas y subió 0, en vez de rebotarlas al servidor.
    expect(push.totalPushed).toBe(0);

    const state = await getSyncState(USER);
    expect(state.pendingPush).toBe(0);
  });

  it('pero SÍ sube una edición local hecha offline antes del primer sync', async () => {
    const { subtemaId, accountId } = await seedCatalog();
    await pushAll(USER);

    // Dispositivo B: base limpia, se baja todo…
    await db.delete();
    await db.open();
    resetAllSyncCursors();
    await pullAll(USER);

    // …y el usuario crea algo sin conexión antes de sincronizar de nuevo.
    const offline = await createMovement({
      kind: 'gasto', date: '2026-04-01', description: 'Offline',
      amount: 7000, currency: 'COP', accountId, subtemaId,
    });

    const { push } = await syncAll(USER);
    expect(push.totalPushed).toBeGreaterThan(0);
    expect(store.some(r => r.sync_id === offline.id)).toBe(true);
  });
});
