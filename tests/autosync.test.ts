import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Política de disparo del sync automático. Lo que se prueba acá es cuándo NO
 * hay que sincronizar, que es la mitad difícil: sin freno, tocar pestañas o
 * recuperar la conexión dispara siete requests por gusto.
 */

let syncCalls = 0;
let syncShouldFail = false;

vi.mock('@/lib/sync', () => ({
  syncAll: async () => {
    syncCalls += 1;
    if (syncShouldFail) throw new Error('red caída');
    return {
      pull: { totalApplied: 2, totalDeleted: 1, conflicts: 0, errors: [] },
      push: { totalPushed: 3, tombstonesPushed: 0, errors: [] },
    };
  },
  getSyncState: async () => ({ pendingPush: 0, lastPullAt: null, lastPushAt: null }),
}));

// useAuth arrastra el cliente de Supabase; el módulo bajo prueba solo necesita
// triggerSync, que no lo toca.
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ userId: null }) }));

const { triggerSync } = await import('@/lib/autoSync');

const USER = 'user-1';
let ahora = 1_000_000;

beforeEach(() => {
  syncCalls = 0;
  syncShouldFail = false;
  ahora += 60 * 60 * 1000; // hora nueva por test: limpia el enfriamiento previo
  vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  vi.stubGlobal('navigator', { onLine: true });
});

describe('triggerSync', () => {
  it('sincroniza la primera vez', async () => {
    await triggerSync(USER);
    expect(syncCalls).toBe(1);
  });

  it('el enfriamiento frena el segundo disparo oportunista', async () => {
    await triggerSync(USER);
    await triggerSync(USER);
    await triggerSync(USER);
    // Abrir la app, volver del segundo plano y cambiar de pestaña en el mismo
    // minuto es un solo sync, no tres.
    expect(syncCalls).toBe(1);
  });

  it('force ignora el enfriamiento', async () => {
    await triggerSync(USER);
    await triggerSync(USER, { force: true });
    // Es el caso de "escribiste algo": hay que subirlo aunque recién se haya
    // sincronizado.
    expect(syncCalls).toBe(2);
  });

  it('pasado el enfriamiento vuelve a sincronizar', async () => {
    await triggerSync(USER);
    ahora += 3 * 60 * 1000;
    await triggerSync(USER);
    expect(syncCalls).toBe(2);
  });

  it('sin conexión no intenta nada', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await triggerSync(USER, { force: true });
    expect(syncCalls).toBe(0);
  });

  it('un usuario distinto tiene su propio enfriamiento', async () => {
    await triggerSync(USER);
    await triggerSync('user-2');
    expect(syncCalls).toBe(2);
  });

  it('un fallo no deja el enfriamiento bloqueando el reintento inmediato', async () => {
    syncShouldFail = true;
    await triggerSync(USER, { force: true });
    expect(syncCalls).toBe(1);

    // El siguiente intento forzado (reconexión, botón manual) tiene que pasar.
    syncShouldFail = false;
    await triggerSync(USER, { force: true });
    expect(syncCalls).toBe(2);
  });
});
