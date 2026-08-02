/**
 * Cliente Supabase para el browser. Singleton: un solo cliente por sesión de JS,
 * si no el auth se pisa entre instancias.
 *
 * La anon key es pública por diseño — lo que protege los datos es RLS
 * (`user_id = auth.uid()` en `sync_records`), no el secreto de la key.
 *
 * `getSupabase()` es ASÍNCRONO a propósito: la librería se carga con un import
 * dinámico para que quede en su propio chunk. Importada de forma estática son
 * ~58 kB gzip que se bajan en el primer load aunque el usuario nunca
 * sincronice, y esta app tiene que abrir rápido en el celular. Así el costo lo
 * paga solo quien entra a Datos e inicia sesión.
 *
 * Cuidado con una trampa de Vite: si las env vars no están definidas en build
 * time, las reemplaza por `undefined`, el throw de abajo queda antes del
 * createClient y Rollup tree-shakea la librería entera. El bundle sale chico
 * pero el sync no funciona. Si el tamaño "mejora" de golpe, revisá el .env.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let loading: Promise<SupabaseClient> | null = null;

/** true si hay credenciales configuradas; la UI de sync se oculta si no. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function getSupabase(): Promise<SupabaseClient> {
  if (cached) return Promise.resolve(cached);
  // Se guarda la promesa en vuelo: dos llamadas casi simultáneas (el panel
  // montando y el auto-sync arrancando) crearían dos clientes distintos, y con
  // dos clientes la sesión de auth se pisa.
  if (loading) return loading;

  loading = (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      throw new Error(
        'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local.',
      );
    }
    const { createClient } = await import('@supabase/supabase-js');
    cached = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    return cached;
  })();

  // Si la carga falla (red caída a mitad del chunk), no dejar la promesa
  // rechazada cacheada para siempre: el siguiente intento debe poder reintentar.
  loading.catch(() => {
    loading = null;
  });

  return loading;
}
