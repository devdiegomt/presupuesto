import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import { getSyncState } from '@/lib/sync';
import { useAutoSyncStatus } from '@/lib/autoSync';
import { useAuth } from '@/lib/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Aviso permanente sobre el estado de los datos.
 *
 * Existe por un incidente concreto: se cargaron movimientos en un celular sin
 * sesión iniciada, nunca se subieron —el único disparador de sync vivía dentro
 * de la pestaña Datos— y al limpiar el navegador se perdieron. En ningún
 * momento la app dijo que esos datos estaban en un solo lugar.
 *
 * Por eso el caso "sin sesión y con datos" se muestra fuerte y en todas las
 * pantallas, no escondido en configuración. Los demás estados son discretos:
 * un aviso que aparece siempre deja de leerse.
 */
export default function SyncBanner() {
  const { userId, loading, configured } = useAuth();
  const { running, lastError } = useAutoSyncStatus();

  const movementCount = useLiveQuery(() => db.movements.count(), []);
  const pending = useLiveQuery(
    () => (userId ? getSyncState(userId).then(s => s.pendingPush) : Promise.resolve(0)),
    [userId],
  );

  if (!isSupabaseConfigured() || !configured || loading) return null;

  // Sin sesión pero con datos: el caso que costó los movimientos de agosto.
  if (!userId) {
    if (!movementCount) return null;
    return (
      <Banner tone="warn">
        <span>
          {movementCount.toLocaleString('es-CO')} movimientos solo en este dispositivo.
          Si borrás los datos del navegador, se pierden.
        </span>
        <Link to="/datos" className="underline whitespace-nowrap font-medium">
          Iniciar sesión
        </Link>
      </Banner>
    );
  }

  if (lastError) {
    return (
      <Banner tone="error">
        <span className="truncate">No se pudo sincronizar: {lastError}</span>
        <Link to="/datos" className="underline whitespace-nowrap font-medium">
          Ver
        </Link>
      </Banner>
    );
  }

  if (running) {
    return <Banner tone="muted"><span>Sincronizando…</span></Banner>;
  }

  // Con sesión, algo pendiente es normal y transitorio: el sync automático lo
  // sube a los pocos segundos. Solo se avisa, sin alarmar.
  if (pending) {
    return (
      <Banner tone="muted">
        <span>
          {pending.toLocaleString('es-CO')} cambio{pending === 1 ? '' : 's'} sin subir
        </span>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: 'warn' | 'error' | 'muted';
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    warn: 'bg-[var(--color-warn)]/15 text-[var(--color-warn)] border-[var(--color-warn)]/40',
    error: 'bg-[var(--color-negative)]/15 text-[var(--color-negative)] border-[var(--color-negative)]/40',
    muted: 'bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border)]',
  };
  return (
    <div
      className={`px-4 py-2 border-b text-xs flex items-center justify-between gap-3 ${styles[tone]}`}
      role="status"
    >
      {children}
    </div>
  );
}
