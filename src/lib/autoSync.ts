/**
 * Política de sincronización automática.
 *
 * Antes el único disparador estaba dentro del panel de la pestaña Datos, o sea
 * el último lugar donde alguien entra mientras carga los gastos del día. Crear
 * un movimiento no sincronizaba nada, y sin sesión iniciada tampoco había
 * ningún aviso: los datos podían vivir semanas en un solo navegador sin que
 * nada lo dijera. Un borrado de datos del navegador se los llevaba y no había
 * copia en ninguna parte.
 *
 * Ahora se sincroniza solo en cuatro momentos:
 *
 *  1. Al abrir la app (con sesión).
 *  2. Unos segundos después de escribir algo, agrupando ediciones seguidas.
 *  3. Cuando vuelve la conexión.
 *  4. Cuando la app vuelve del segundo plano.
 *
 * Los disparos 1, 3 y 4 son oportunistas y respetan un enfriamiento: nadie
 * quiere siete requests por tocar una pestaña. El disparo 2 no lo respeta —
 * hay algo escrito esperando y subirlo es justamente el punto.
 */

import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { getSyncState, syncAll } from './sync';
import { useAuth } from './useAuth';

/** Ventana en la que un disparo oportunista no vuelve a sincronizar. */
const OPPORTUNISTIC_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Espera tras una escritura antes de subir. Suficiente para que cargar tres
 * gastos seguidos sea un solo sync, y corto como para que cerrar la app al
 * minuto siguiente ya encuentre todo arriba.
 */
const WRITE_DEBOUNCE_MS = 4000;

export interface AutoSyncStatus {
  running: boolean;
  lastError: string | null;
  lastOkAt: string | null;
  /** Resumen legible del último sync, para el panel de Datos. */
  lastSummary: string | null;
}

let status: AutoSyncStatus = {
  running: false,
  lastError: null,
  lastOkAt: null,
  lastSummary: null,
};
const listeners = new Set<() => void>();

function setStatus(next: Partial<AutoSyncStatus>) {
  status = { ...status, ...next };
  for (const l of listeners) l();
}

/** Estado del sync automático, compartido por toda la UI. */
export function useAutoSyncStatus(): AutoSyncStatus {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

const lastRunAt = new Map<string, number>();

export interface TriggerOptions {
  /** Ignora el enfriamiento. Para el botón manual y para escrituras locales. */
  force?: boolean;
}

/**
 * Dispara un sync. Seguro de llamar en cualquier momento: `syncAll` ya colapsa
 * las llamadas concurrentes, y acá encima se filtran las repetidas.
 */
export async function triggerSync(
  userId: string,
  { force = false }: TriggerOptions = {},
): Promise<void> {
  // Sin conexión no tiene sentido intentar; el listener de 'online' se encarga.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const since = Date.now() - (lastRunAt.get(userId) ?? 0);
  if (!force && since < OPPORTUNISTIC_COOLDOWN_MS) return;

  lastRunAt.set(userId, Date.now());
  setStatus({ running: true, lastError: null });
  try {
    const { pull, push } = await syncAll(userId);
    const errors = [...pull.errors, ...push.errors];
    if (errors.length) {
      setStatus({ running: false, lastError: errors[0]!, lastSummary: null });
      return;
    }
    setStatus({
      running: false,
      lastError: null,
      lastOkAt: new Date().toISOString(),
      lastSummary:
        `Bajados ${pull.totalApplied} · borrados ${pull.totalDeleted} · ` +
        `subidos ${push.totalPushed}` +
        // Los tombstones se cuentan aparte de totalPushed: sin nombrarlos, un
        // borrado propagado se leía como "subidos 0".
        (push.tombstonesPushed ? ` · ${push.tombstonesPushed} borrado(s) enviado(s)` : '') +
        (pull.conflicts ? ` · ${pull.conflicts} conflictos (ganó el más reciente)` : ''),
    });
  } catch (e) {
    setStatus({ running: false, lastError: (e as Error).message, lastSummary: null });
  }
}

/**
 * Instala los disparadores. Va montado una sola vez, en el layout raíz — no en
 * una ruta, porque una ruta solo existe mientras se la está mirando.
 */
export function useAutoSync(): void {
  const { userId } = useAuth();

  // Cuántos cambios locales esperan subir. useLiveQuery lo recalcula solo
  // cuando Dexie cambia, así que sirve de señal de "se escribió algo".
  const pending = useLiveQuery(
    () => (userId ? getSyncState(userId).then(s => s.pendingPush) : Promise.resolve(0)),
    [userId],
  );

  // 1) Al abrir la app. 3) Al volver la conexión. 4) Al volver del segundo plano.
  useEffect(() => {
    if (!userId) return;

    void triggerSync(userId);

    const onOnline = () => void triggerSync(userId, { force: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void triggerSync(userId);
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  // 2) Poco después de escribir algo.
  useEffect(() => {
    if (!userId || !pending) return;
    const t = setTimeout(() => void triggerSync(userId, { force: true }), WRITE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [userId, pending]);
}
