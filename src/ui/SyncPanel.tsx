import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/schema';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { getSyncState, resetSyncState, syncAll } from '@/lib/sync';

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
      const { error } = await getSupabase().auth.signInWithOtp({
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
      const { error } = await getSupabase().auth.verifyOtp({
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

function SignedIn({ userId, email }: { userId: string; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // useLiveQuery reacciona a los cambios de Dexie; `tick` fuerza el recálculo
  // después de un sync, porque los cursores viven en localStorage y Dexie no
  // se entera de que cambiaron.
  const state = useLiveQuery(() => getSyncState(userId), [userId, tick]);
  const tombstones = useLiveQuery(() => db.syncTombstones.count(), []);

  const runSync = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { pull, push } = await syncAll(userId);
      const errors = [...pull.errors, ...push.errors];
      if (errors.length) {
        setMsg(`Con errores: ${errors.slice(0, 2).join(' · ')}`);
      } else {
        setMsg(
          `Bajados ${pull.totalApplied} · borrados ${pull.totalDeleted} · ` +
          `subidos ${push.totalPushed}` +
          (pull.conflicts ? ` · ${pull.conflicts} conflictos (ganó el más reciente)` : ''),
        );
      }
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setTick(t => t + 1);
    }
  }, [userId]);

  // Un sync al montar, para que abrir la app en otro dispositivo ya traiga lo
  // último sin que haya que acordarse de tocar el botón.
  useEffect(() => {
    void runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function signOut() {
    await getSupabase().auth.signOut();
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
          Último pull: {state.lastPullAt ? state.lastPullAt.slice(0, 19).replace('T', ' ') : '—'}
          {' · '}
          push: {state.lastPushAt ? state.lastPushAt.slice(0, 19).replace('T', ' ') : '—'}
        </p>
      )}

      {msg && <p className="text-xs break-words">{msg}</p>}
    </div>
  );
}
