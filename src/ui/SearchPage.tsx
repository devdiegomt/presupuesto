import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/db/schema';
import { formatMoney } from '@/db/money';
import { filterMovements, summarize, type SearchIndex } from '@/domain/search';
import type { Currency, Kind, Movement } from '@/db/types';
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
  { id: 'transferencia', label: 'Transf.' },
  { id: 'ajuste', label: 'Ajustes' },
];

const MAX_RENDER = 300;

export default function SearchPage() {
  const movements = useLiveQuery(() => db.movements.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.toArray(), []);
  const temas = useLiveQuery(() => db.temas.toArray(), []);

  const [q, setQ] = useState('');
  const [currency, setCurrency] = useState<'all' | Currency>('all');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);

  const index: SearchIndex = useMemo(
    () => ({
      accountName: new Map((accounts ?? []).map(a => [a.id, a.name])),
      subtemaName: new Map((subtemas ?? []).map(s => [s.id, s.name])),
      temaIdBySubtema: new Map((subtemas ?? []).map(s => [s.id, s.temaId])),
      temaName: new Map((temas ?? []).map(t => [t.id, t.name])),
    }),
    [accounts, subtemas, temas],
  );

  const results = useMemo(() => {
    if (!movements) return [];
    return filterMovements(
      movements,
      { q, currency, kind, fromDate: fromDate || undefined, toDate: toDate || undefined },
      index,
    );
  }, [movements, q, currency, kind, fromDate, toDate, index]);

  const totals = useMemo(() => summarize(results), [results]);
  const visible = results.slice(0, MAX_RENDER);
  const hasActiveFilters =
    currency !== 'all' || kind !== 'all' || !!fromDate || !!toDate;

  function subtemaName(id?: string) {
    return id ? index.subtemaName.get(id) : undefined;
  }
  function accountName(id?: string) {
    return id ? index.accountName.get(id) : undefined;
  }

  if (!movements) return <section className="p-4">Cargando…</section>;

  return (
    <section className="p-4 space-y-3 pb-8">
      <div className="sticky top-0 -mx-4 px-4 py-2 bg-[var(--color-bg)] z-10 space-y-2">
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar en descripciones, cuentas, subtemas…"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-base outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            className={`px-2 py-1 rounded text-xs border ${
              hasActiveFilters
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
          >
            {showFilters ? 'Ocultar filtros' : hasActiveFilters ? 'Filtros activos' : 'Filtros'}
          </button>
          <span className="text-xs text-[var(--color-text-dim)] tabular-nums">
            {results.length} resultado{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)] mb-1">Moneda</p>
            <div className="flex gap-1">
              {(['all', 'COP', 'BRL'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2 py-1 rounded text-xs border ${
                    currency === c
                      ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
                  }`}
                >
                  {c === 'all' ? 'Todas' : c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)] mb-1">Tipo</p>
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
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)] mb-1">Desde</p>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)] mb-1">Hasta</p>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setCurrency('all'); setKind('all'); setFromDate(''); setToDate(''); }}
              className="text-xs text-[var(--color-text-dim)] underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {totals.byCurrency.length > 0 && (q || hasActiveFilters) && (
        <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-2">
          {totals.byCurrency.map(t => (
            <div key={t.currency} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{t.currency}</span>
              <span className="text-xs text-[var(--color-text-dim)]">
                <span className="text-[var(--color-positive)] tabular-nums">
                  +{formatMoney(t.ingresoMinor, t.currency)}
                </span>
                {' · '}
                <span className="text-[var(--color-negative)] tabular-nums">
                  -{formatMoney(t.gastoMinor, t.currency)}
                </span>
                {' · '}
                <span className={`tabular-nums ${t.netMinor < 0 ? 'text-[var(--color-negative)]' : ''}`}>
                  neto {formatMoney(t.netMinor, t.currency)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          {q || hasActiveFilters ? 'Sin resultados con esos filtros.' : 'Escribe para buscar en tu historia.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--color-border)]">
            {visible.map((m, i) => {
              const prev = i > 0 ? visible[i - 1] : undefined;
              const showMonthHeader = !prev || prev.month !== m.month;
              const sub = subtemaName(m.subtemaId);
              const signedForDisplay =
                m.kind === 'transferencia'
                  ? -m.amountMinor
                  : m.amountMinor;
              const color =
                m.kind === 'gasto' || (m.kind === 'ajuste' && m.amountMinor < 0)
                  ? 'text-[var(--color-negative)]'
                  : m.kind === 'ingreso' || (m.kind === 'ajuste' && m.amountMinor > 0)
                    ? 'text-[var(--color-positive)]'
                    : 'text-[var(--color-text-dim)]';
              const rightAmount = m.kind === 'transferencia' ? m.amountMinor : m.amountMinor;
              return (
                <li key={m.id}>
                  {showMonthHeader && (
                    <div className="pt-3 pb-1 text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                      {m.month}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="w-full py-2 flex items-start justify-between gap-3 text-left active:bg-[var(--color-surface)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{m.description || '(sin descripción)'}</p>
                      <p className="text-xs text-[var(--color-text-dim)] truncate">
                        {m.date} · {KIND_LABEL[m.kind]}
                        {sub && ` · ${sub}`}
                        {m.accountId && ` · ${accountName(m.accountId)}`}
                        {m.kind === 'transferencia' &&
                          ` · ${accountName(m.fromAccountId)} → ${accountName(m.toAccountId)}`}
                      </p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className={`text-sm font-medium tabular-nums ${color}`}>
                        {m.kind === 'transferencia'
                          ? formatMoney(rightAmount, m.currency)
                          : formatMoney(signedForDisplay, m.currency)}
                      </p>
                      {m.kind === 'transferencia' && m.toAmountMinor != null && m.toCurrency && (
                        <p className="text-xs text-[var(--color-text-dim)] tabular-nums">
                          → {formatMoney(m.toAmountMinor, m.toCurrency)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {results.length > MAX_RENDER && (
            <p className="text-xs text-[var(--color-text-dim)] pt-2 text-center">
              Mostrando {MAX_RENDER} de {results.length}. Refina los filtros para acotar.
            </p>
          )}
        </>
      )}

      <MovementEditModal movement={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
