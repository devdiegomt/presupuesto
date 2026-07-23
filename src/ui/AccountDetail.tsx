import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { db } from '@/db/schema';
import { computeStatement, type StatementRow } from '@/domain/statement';
import { formatMoney } from '@/db/money';
import type { Kind, Movement } from '@/db/types';
import { MovementEditModal } from './MovementEditModal';

const KIND_LABEL: Record<Kind, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  transferencia: 'Transf.',
  ajuste: 'Ajuste',
  nota: 'Nota',
};

const KIND_FILTERS: Array<{ id: 'all' | Kind; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'gasto', label: 'Gastos' },
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'transferencia', label: 'Transferencias' },
  { id: 'ajuste', label: 'Ajustes' },
];

export default function AccountDetail() {
  const { accountId } = useParams();
  const id = accountId ?? '';

  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id]);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.toArray(), []);
  const statement = useLiveQuery(() => (id ? computeStatement(id) : undefined), [id]);

  const [month, setMonth] = useState<'all' | string>('all');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Movement | null>(null);

  const accountName = useMemo(() => {
    const m = new Map((accounts ?? []).map(a => [a.id, a.name]));
    return (aid?: string) => (aid ? m.get(aid) ?? aid : '—');
  }, [accounts]);

  const subtemaName = useMemo(() => {
    const m = new Map((subtemas ?? []).map(s => [s.id, s.name]));
    return (sid?: string) => (sid ? m.get(sid) ?? sid : undefined);
  }, [subtemas]);

  const months = useMemo(() => {
    const set = new Set<string>();
    statement?.rows.forEach(r => set.add(r.movement.month));
    return [...set].sort().reverse();
  }, [statement]);

  const visibleRows = useMemo(() => {
    if (!statement) return [] as StatementRow[];
    const ql = q.trim().toLowerCase();
    return statement.rows.filter(r => {
      if (month !== 'all' && r.movement.month !== month) return false;
      if (kind !== 'all' && r.movement.kind !== kind) return false;
      if (ql && !r.movement.description.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [statement, month, kind, q]);

  if (!account) return <section className="p-4">Cargando…</section>;
  if (!statement) return <section className="p-4">Cargando movimientos…</section>;

  return (
    <section className="p-4 space-y-4">
      <header className="space-y-1">
        <Link to="/cuentas" className="text-xs text-[var(--color-accent)]">← Cuentas</Link>
        <h2 className="text-lg font-semibold">{account.name}</h2>
        <p
          className={`text-2xl font-semibold tabular-nums ${
            statement.totalMinor < 0 ? 'text-[var(--color-negative)]' : ''
          }`}
        >
          {formatMoney(statement.totalMinor, account.currency)}
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {statement.rows.length} movimientos · {account.currency}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/reconciliar/${account.id}`}
          className="px-3 py-1.5 rounded text-xs bg-[var(--color-surface)] border border-[var(--color-border)]"
        >
          Reconciliar (desface)
        </Link>
      </div>

      <div className="space-y-2">
        <input
          type="search"
          placeholder="Buscar descripción…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Todos los meses</option>
            {months.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {KIND_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setKind(f.id)}
                className={`px-2 py-1 rounded text-xs border ${
                  kind === f.id
                    ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-dim)]">
          Mostrando {visibleRows.length} de {statement.rows.length}
        </p>
      </div>

      <ul className="divide-y divide-[var(--color-border)]">
        {[...visibleRows].reverse().map(r => {
          const m = r.movement;
          const sign = r.signedMinor < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-positive)]';
          const sub = subtemaName(m.subtemaId);
          const cp = r.counterpartyAccountId;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="w-full py-3 flex items-start justify-between gap-3 text-left active:bg-[var(--color-surface)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{m.description || '(sin descripción)'}</p>
                  <p className="text-xs text-[var(--color-text-dim)] truncate">
                    {m.date} · {KIND_LABEL[m.kind]}
                    {sub && ` · ${sub}`}
                    {cp && ` · ↔ ${accountName(cp)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium tabular-nums ${sign}`}>
                    {formatMoney(r.signedMinor, account.currency)}
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)] tabular-nums">
                    {formatMoney(r.runningMinor, account.currency)}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <MovementEditModal movement={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
