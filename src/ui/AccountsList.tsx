import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { db } from '@/db/schema';
import { computeBalances, type AccountBalance } from '@/domain/balances';
import { formatMoney } from '@/db/money';
import type { Account, Currency } from '@/db/types';
import { AccountEditModal } from './AccountEditModal';

export default function AccountsList() {
  const balances = useLiveQuery(() => computeBalances(), []);
  const accountsById = useLiveQuery(async () => {
    const list = await db.accounts.toArray();
    return new Map(list.map(a => [a.id, a]));
  }, []);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  if (!balances || !accountsById) return <section className="p-4">Cargando…</section>;

  const groups = new Map<Currency, AccountBalance[]>();
  for (const b of balances) {
    if (!groups.has(b.currency)) groups.set(b.currency, []);
    groups.get(b.currency)!.push(b);
  }

  return (
    <section className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-medium">Cuentas</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded text-sm bg-[var(--color-accent)] text-slate-900 font-medium"
        >
          + Nueva
        </button>
      </header>

      {balances.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          No hay cuentas. Crea una con el botón "+ Nueva".
        </p>
      ) : (
        [...groups.entries()].map(([currency, list]) => {
          const subtotal = list.reduce((s, b) => s + b.balanceMinor, 0);
          return (
            <div key={currency}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-medium text-[var(--color-text-dim)]">{currency}</h3>
                <span
                  className={`tabular-nums text-sm ${
                    subtotal < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-dim)]'
                  }`}
                >
                  Subtotal: {formatMoney(subtotal, currency)}
                </span>
              </div>
              <ul className="space-y-2">
                {list.map(b => {
                  const acc = accountsById.get(b.accountId);
                  return (
                    <li
                      key={b.accountId}
                      className="flex items-center gap-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                    >
                      <Link
                        to={`/cuentas/${b.accountId}`}
                        className="flex-1 p-3 flex items-center justify-between active:bg-[var(--color-surface-2)]"
                      >
                        <span className="font-medium">
                          {b.name}
                          {acc?.archived && (
                            <span className="ml-2 text-xs text-[var(--color-text-dim)]">
                              (archivada)
                            </span>
                          )}
                        </span>
                        <span
                          className={`tabular-nums font-medium ${
                            b.balanceMinor < 0 ? 'text-[var(--color-negative)]' : ''
                          }`}
                        >
                          {formatMoney(b.balanceMinor, b.currency)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => acc && setEditing(acc)}
                        className="pr-3 py-3 text-[var(--color-text-dim)] text-lg"
                        aria-label="Editar cuenta"
                      >
                        ✎
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}

      <AccountEditModal
        account={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
      <AccountEditModal
        account={null}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </section>
  );
}
