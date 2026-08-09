import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/schema';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { getSyncState, resetSyncState } from '@/lib/sync';
import { triggerSync, useAutoSyncStatus } from '@/lib/autoSync';

export default function SyncPanel() {
  const { userId, email, loading, configured } = useAuth();

  if (!configured) {
    return (
      <div>
        <h2 className="text-base font-medium mb-2">Sincronización</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Sin configurar. Copiá <code>.env.example</code> a <code>.env.local</code> y
          completá las credenciales de Supabase.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-base font-medium mb-2">Sincronización</h2>
        <p className="text-sm text-[var(--color-text-dim)]">Cargando sesión…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-medium mb-2">Sincronización</h2>
      {userId ? <SignedIn userId={userId} email={email} /> : <SignIn />}
    </div>
  );
}

function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // No auto-crear cuentas desde acá: si el mail está mal escrito, mejor
        // que falle a que quede una cuenta huérfana con datos sueltos.
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('code');
      setMsg(`Código enviado a ${email.trim()}.`);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      // onAuthStateChange en useAuth se encarga de re-renderizar.
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--color-text-dim)]">
        Iniciá sesión para sincronizar entre dispositivos.
      </p>
      {step === 'email' ? (
        <div className="flex gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && email.trim() && sendCode()}
            placeholder="tu@correo.com"
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy || !email.trim()}
            className="px-3 py-2 rounded bg-[var(--color-accent)] text-slate-900 text-sm font-medium disabled:opacity-40"
          >
            Enviar código
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && code.trim() && verify()}
              placeholder="Código de 6 dígitos"
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-sm tabular-nums"
            />
            <button
              type="button"
              onClick={verify}
              disabled={busy || !code.trim()}
              className="px-3 py-2 rounded bg-[var(--color-accent)] text-slate-900 text-sm font-medium disabled:opacity-40"
            >
              Entrar
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setStep('email'); setCode(''); setMsg(null); }}
            className="text-xs text-[var(--color-text-dim)] underline"
          >
            Usar otro correo
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-[var(--color-text-dim)] break-words">{msg}</p>}
    </div>
  );
}

/**
 * El cursor de pull queda en la época cuando el servidor no tenía nada que
 * mandar. Mostrar "1970-01-01" ahí parece un error; es simplemente "todavía
 * nada".
 */
function fmtCursor(iso: string | null): string {
  if (!iso || iso.startsWith('1970-01-01')) return '—';
  return iso.slice(0, 19).replace('T', ' ');
}

function SignedIn({ userId, email }: { userId: string; email: string | null }) {
  const [tick, setTick] = useState(0);

  // El disparo automático vive en useAutoSync(), montado en el layout raíz.
  // Este panel solo ofrece el botón manual y muestra el estado compartido; si
  // tuviera su propia política, habría dos compitiendo.
  const { running, lastError, lastSummary } = useAutoSyncStatus();

  // useLiveQuery reacciona a los cambios de Dexie; `tick` fuerza el recálculo
  // después de un sync, porque los cursores viven en localStorage y Dexie no
  // se entera de que cambiaron.
  const state = useLiveQuery(() => getSyncState(userId), [userId, tick]);
  const tombstones = useLiveQuery(() => db.syncTombstones.count(), []);

  // Refrescar los cursores mostrados cuando termina un sync disparado desde
  // cualquier lado (automático o manual).
  useEffect(() => {
    if (!running) setTick(t => t + 1);
  }, [running]);

  const runSync = useCallback(
    () => triggerSync(userId, { force: true }),
    [userId],
  );

  const busy = running;
  const msg = lastError ? `Con errores: ${lastError}` : lastSummary;

  async function signOut() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  }

  const pending = state?.pendingPush ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm truncate">{email}</p>
          <p className="text-xs text-[var(--color-text-dim)]">
            {pending > 0
              ? `${pending} cambio${pending === 1 ? '' : 's'} sin subir`
              : 'Todo sincronizado'}
            {tombstones ? ` · ${tombstones} borrado${tombstones === 1 ? '' : 's'} pendiente${tombstones === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${
            busy
              ? 'bg-[var(--color-warn)]'
              : pending > 0
                ? 'bg-[var(--color-warn)]'
                : 'bg-[var(--color-positive)]'
          }`}
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runSync}
          disabled={busy}
          className="px-3 py-2 rounded bg-[var(--color-accent)] text-slate-900 text-sm font-medium disabled:opacity-40"
        >
          {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          Cerrar sesión
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm('Olvidar los cursores y re-sincronizar todo desde cero? No borra datos.')) return;
            resetSyncState(userId);
            setTick(t => t + 1);
            void runSync();
          }}
          className="px-3 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-dim)] text-sm"
        >
          Re-sync completo
        </button>
      </div>

      {state && (
        <p className="text-xs text-[var(--color-text-dim)]">
          Último pull: {fmtCursor(state.lastPullAt)}
          {' · '}
          push: {fmtCursor(state.lastPushAt)}
        </p>
      )}

      {msg && <p className="text-xs break-words">{msg}</p>}
    </div>
  );
}
