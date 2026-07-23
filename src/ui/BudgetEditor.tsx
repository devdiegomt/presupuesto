import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/db/schema';
import { formatMoney, fromMinor, toMinor } from '@/db/money';
import { copyBudget, upsertBudget } from '@/domain/budgets';
import type { Currency, Subtema, Tema } from '@/db/types';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function BudgetEditor() {
  const { ym } = useParams();
  const navigate = useNavigate();
  const month = ym ?? currentMonth();

  const [currency, setCurrency] = useState<Currency>('COP');
  const [msg, setMsg] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string>('');

  const temas = useLiveQuery(() => db.temas.orderBy('name').toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.orderBy('name').toArray(), []);
  const budgets = useLiveQuery(
    () => db.budgets.where('month').equals(month).toArray(),
    [month],
  );
  const movements = useLiveQuery(() => db.movements.toArray(), []);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (budgets ?? []).forEach(b => set.add(b.month));
    (movements ?? []).forEach(m => set.add(m.month));
    set.add(month);
    return [...set].sort();
  }, [budgets, movements, month]);

  const budgetsWithData = useMemo(() => {
    const set = new Set<string>();
    (movements ?? []).forEach(m => set.add(m.month));
    return [...set].sort().filter(m => m !== month);
  }, [movements, month]);

  useEffect(() => {
    if (!copyFrom && budgetsWithData.length) {
      setCopyFrom(budgetsWithData[budgetsWithData.length - 1]!);
    }
  }, [budgetsWithData, copyFrom]);

  if (!temas || !subtemas || !budgets) {
    return <section className="p-4">Cargando…</section>;
  }

  const previstoBySubtema = new Map(
    budgets.filter(b => b.currency === currency).map(b => [b.subtemaId, b.previstoMinor]),
  );

  const grouped = new Map<Tema, Subtema[]>();
  const temaById = new Map(temas.map(t => [t.id, t]));
  for (const s of subtemas) {
    const t = temaById.get(s.temaId);
    if (!t) continue;
    if (!grouped.has(t)) grouped.set(t, []);
    grouped.get(t)!.push(s);
  }

  const grandTotal = [...previstoBySubtema.values()].reduce((s, v) => s + v, 0);

  async function onCopy(overwrite: boolean) {
    if (!copyFrom) return;
    const res = await copyBudget(copyFrom, month, currency, overwrite);
    setMsg(
      `Copiadas ${res.copied} líneas${
        res.skipped ? `, ${res.skipped} ya existían (usa "sobreescribir" si quieres reemplazar)` : ''
      }.`,
    );
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <section className="p-4 space-y-4 pb-8">
      <header className="space-y-1">
        <Link to={`/mes/${month}`} className="text-xs text-[var(--color-accent)]">
          ← Mes {month}
        </Link>
        <h2 className="text-lg font-semibold">Presupuesto</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Edita el previsto por subtema. Se guarda al salir del campo. Deja en 0 para borrar.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <select
          value={month}
          onChange={e => navigate(`/presupuesto/${e.target.value}`)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {(['COP', 'BRL'] as Currency[]).map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-2 py-1 rounded text-xs border ${
                currency === c
                  ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Total previsto {month}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(grandTotal, currency)}
        </p>
      </div>

      {budgetsWithData.length > 0 && (
        <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Copiar de otro mes
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={copyFrom}
              onChange={e => setCopyFrom(e.target.value)}
              className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
            >
              {budgetsWithData.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onCopy(false)}
              className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)]"
            >
              Copiar (sólo faltantes)
            </button>
            <button
              type="button"
              onClick={() => onCopy(true)}
              className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface-2)] border border-[var(--color-negative)] text-[var(--color-negative)]"
            >
              Sobreescribir
            </button>
          </div>
          {msg && <p className="text-xs text-[var(--color-text-dim)]">{msg}</p>}
        </div>
      )}

      <ul className="space-y-3">
        {[...grouped.entries()]
          .sort((a, b) => a[0].name.localeCompare(b[0].name, 'es'))
          .map(([tema, subs]) => {
            const temaTotal = subs.reduce(
              (s, x) => s + (previstoBySubtema.get(x.id) ?? 0),
              0,
            );
            return (
              <li
                key={tema.id}
                className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
              >
                <header className="flex items-baseline justify-between px-3 py-2 border-b border-[var(--color-border)]">
                  <h3 className="font-medium">{tema.name}</h3>
                  <span className="text-sm tabular-nums text-[var(--color-text-dim)]">
                    {formatMoney(temaTotal, currency)}
                  </span>
                </header>
                <ul>
                  {subs
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                    .map(sub => (
                      <SubtemaBudgetRow
                        key={sub.id}
                        month={month}
                        subtema={sub}
                        currency={currency}
                        currentMinor={previstoBySubtema.get(sub.id) ?? 0}
                      />
                    ))}
                </ul>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function SubtemaBudgetRow({
  month,
  subtema,
  currency,
  currentMinor,
}: {
  month: string;
  subtema: Subtema;
  currency: Currency;
  currentMinor: number;
}) {
  const [str, setStr] = useState(currentMinor > 0 ? String(fromMinor(currentMinor, currency)) : '');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setStr(currentMinor > 0 ? String(fromMinor(currentMinor, currency)) : '');
  }, [currentMinor, currency]);

  async function commit() {
    const trimmed = str.replace(',', '.').trim();
    const n = trimmed === '' ? 0 : parseFloat(trimmed);
    const minor = isNaN(n) ? 0 : toMinor(n, currency);
    if (minor === currentMinor) return;
    await upsertBudget(month, subtema.id, minor, currency);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 700);
  }

  return (
    <li className="px-3 py-2 flex items-center justify-between gap-3 border-t border-[var(--color-border)] first:border-t-0">
      <span className="text-sm truncate flex-1">{subtema.name}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={str}
          onChange={e => setStr(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="0"
          className={`w-32 text-right tabular-nums bg-[var(--color-bg)] border rounded px-2 py-1 text-sm outline-none ${
            savedFlash
              ? 'border-[var(--color-accent)]'
              : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
          }`}
        />
      </div>
    </li>
  );
}
