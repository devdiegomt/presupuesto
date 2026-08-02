import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

export interface AuthState {
  session: Session | null;
  userId: string | null;
  email: string | null;
  loading: boolean;
  configured: boolean;
}

/**
 * Sesión de Supabase como estado de React.
 *
 * `loading` arranca en true y solo baja cuando sabemos si hay sesión o no: sin
 * eso, la UI parpadearía mostrando "iniciá sesión" al recargar con sesión viva.
 */
export function useAuth(): AuthState {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    // El cliente ahora llega por import dinámico, así que la suscripción no
    // existe todavía cuando React podría querer limpiarla.
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      try {
        const supabase = await getSupabase();
        if (!alive) return;

        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setSession(data.session);
        setLoading(false);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
          setSession(next);
          setLoading(false);
        });
        // Si el desmontaje ocurrió mientras se cargaba el chunk, el cleanup ya
        // corrió con unsubscribe en null: hay que darla de baja acá o queda
        // viva escribiendo estado en un componente muerto.
        if (!alive) {
          sub.subscription.unsubscribe();
          return;
        }
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        // Chunk que no cargó (red caída). Sin esto el panel se queda en
        // "Cargando sesión…" para siempre.
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [configured]);

  return {
    session,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    loading,
    configured,
  };
}
