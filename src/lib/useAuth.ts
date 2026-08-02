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
    const supabase = getSupabase();
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
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
