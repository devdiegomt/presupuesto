import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { accountUsage, createAccount, deleteAccount, updateAccount } from '@/domain/accounts';
import type { Account, Currency } from '@/db/types';

export function AccountEditModal({
  account,
  open,
  onClose,
}: {
  account: Account | null;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!account;
  const [name, setName] = useState(account?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? 'COP');
  const [archived, setArchived] = useState<boolean>(account?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const usage = useLiveQuery(
    () => (account ? accountUsage(account.id) : Promise.resolve(0)),
    [account?.id],
  );

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setCurrency(account?.currency ?? 'COP');
    setArchived(account?.archived ?? false);
    setErr(null);
    setConfirmDel(false);
  }, [account, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSave = name.trim().length > 0;

  async function onSave() {
    setBusy(true);
    setErr(null);
    try {
      if (isEdit) {
        await updateAccount(account!.id, { name, archived });
      } else {
        await createAccount({ name, currency });
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!account) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount(account.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-[var(--color-bg)] rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium">{isEdit ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-dim)] w-8 h-8 flex items-center justify-center"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
              Nombre
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
              Moneda {isEdit && <span className="text-[var(--color-text-dim)] normal-case">(no editable)</span>}
            </label>
            <div className="flex gap-1">
              {(['COP', 'BRL'] as Currency[]).map(c => (
                <button
                  key={c}
                  type="button"
                  disabled={isEdit}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    currency === c
                      ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
                  } ${isEdit ? 'opacity-60' : ''}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={e => setArchived(e.target.checked)}
              />
              <span>Archivada (oculta del selector al capturar)</span>
            </label>
          )}

          {isEdit && usage !== undefined && (
            <p className="text-xs text-[var(--color-text-dim)]">
              {usage} movimiento{usage === 1 ? '' : 's'} referencian esta cuenta.
            </p>
          )}

          {err && (
            <p className="text-sm text-[var(--color-negative)] break-words">{err}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || busy}
              className="w-full py-3 rounded-lg bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
            >
              {isEdit ? 'Guardar' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 rounded-lg border border-[var(--color-border)] text-sm"
            >
              Cancelar
            </button>
            {isEdit && (
              <div className="pt-2 border-t border-[var(--color-border)]">
                {!confirmDel ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDel(true)}
                    disabled={(usage ?? 0) > 0}
                    className="w-full py-2 rounded-lg border border-[var(--color-negative)] text-[var(--color-negative)] text-sm disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDel(false)}
                      className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg bg-[var(--color-negative)] text-slate-900 font-medium text-sm"
                    >
                      Sí, eliminar
                    </button>
                  </div>
                )}
                {(usage ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                    Para eliminar, primero mueve o elimina sus movimientos, o archívala.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
