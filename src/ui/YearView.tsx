import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatMoney } from '@/db/money';
import { computeYearSummary, type YearMonthRow } from '@/domain/yearly';
import type { Currency } from '@/db/types';

const currentYear = () => String(new Date().getFullYear());
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function YearView() {
  const { yyyy } = useParams();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<Currency>('COP');
  const year = yyyy ?? currentYear();

  const summary = useLiveQuery(
    () => computeYearSummary(year, currency),
    [year, currency],
  );

  useEffect(() => {
    if (yyyy) return;
    if (summary?.availableYears.length) {
      const latest = summary.availableYears[summary.availableYears.length - 1]!;
      navigate(`/anio/${latest}`, { replace: true });
    }
  }, [yyyy, summary?.availableYears, navigate]);

  if (!summary) return <section className="p-4">Cargando…</section>;

  const availableYears = summary.availableYears;
  if (availableYears.length === 0) {
    return (
      <section className="p-4 text-sm text-[var(--color-text-dim)]">
        No hay movimientos aún.
      </section>
    );
  }

  const maxMonthValue = Math.max(
    1,
    ...summary.months.flatMap(m => [m.ingresoMinor, m.gastoMinor]),
  );

  return (
    <section className="p-4 space-y-4 pb-8">
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-xs text-[var(--color-accent)]">← Inicio</Link>
          <select
            value={year}
            onChange={e => navigate(`/anio/${e.target.value}`)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
          >
            {[...availableYears].reverse().map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
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
      </header>

      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 grid grid-cols-3 gap-2">
        <Stat label="Ingresos" value={summary.totalIngresoMinor} currency={currency} color="text-[var(--color-positive)]" />
        <Stat label="Gastos" value={summary.totalGastoMinor} currency={currency} color="text-[var(--color-negative)]" />
        <Stat
          label="Neto"
          value={summary.totalNetoMinor}
          currency={currency}
          color={summary.totalNetoMinor < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-positive)]'}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Por mes</h3>
        <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          <ul className="divide-y divide-[var(--color-border)]">
            {summary.months.map((m, i) => (
              <MonthRow
                key={m.month}
                row={m}
                monthName={MONTH_NAMES[i]!}
                year={year}
                max={maxMonthValue}
                currency={currency}
              />
            ))}
          </ul>
        </div>
      </div>

      {summary.temas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Temas del año</h3>
          <ul className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {summary.temas.map(t => (
              <li key={t.temaId} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{t.name}</p>
                  <div className="mt-1 h-1 w-full rounded bg-[var(--color-surface-2)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-accent)]"
                      style={{ width: `${Math.round(t.share * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <p className="text-sm tabular-nums">{formatMoney(t.realMinor, currency)}</p>
                  <p className="text-xs text-[var(--color-text-dim)] tabular-nums">
                    {Math.round(t.share * 100)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.accounts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Saldos a fin de mes</h3>
          <ul className="space-y-2">
            {summary.accounts.map(a => (
              <li
                key={a.accountId}
                className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3"
              >
                <p className="text-sm font-medium mb-2">{a.name}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                  {a.monthlySaldos.map((s, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="text-[var(--color-text-dim)]">{MONTH_NAMES[i]}</span>
                      <span
                        className={`tabular-nums ${
                          s < 0 ? 'text-[var(--color-negative)]' : ''
                        }`}
                      >
                        {formatMoney(s, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label, value, currency, color,
}: {
  label: string;
  value: number;
  currency: Currency;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${color}`}>
        {formatMoney(value, currency)}
      </p>
    </div>
  );
}

function MonthRow({
  row, monthName, year, max, currency,
}: {
  row: YearMonthRow;
  monthName: string;
  year: string;
  max: number;
  currency: Currency;
}) {
  const ingresoPct = Math.round((row.ingresoMinor / max) * 100);
  const gastoPct = Math.round((row.gastoMinor / max) * 100);
  const monthKey = row.month;

  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline justify-between">
        <Link
          to={`/mes/${monthKey}`}
          className="text-sm font-medium hover:text-[var(--color-accent)]"
        >
          {monthName} <span className="text-[var(--color-text-dim)] text-xs">{year}</span>
        </Link>
        <div className="flex items-baseline gap-2">
          {row.closedAt && (
            <span className="text-xs text-[var(--color-accent)]">🔒</span>
          )}
          <span
            className={`text-sm tabular-nums ${
              row.netoMinor < 0 ? 'text-[var(--color-negative)]' : ''
            }`}
          >
            {formatMoney(row.netoMinor, currency)}
          </span>
        </div>
      </div>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-dim)] w-6">in</span>
          <div className="flex-1 h-1.5 rounded bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-positive)]"
              style={{ width: `${ingresoPct}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-[var(--color-text-dim)] w-20 text-right">
            {formatMoney(row.ingresoMinor, currency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-dim)] w-6">out</span>
          <div className="flex-1 h-1.5 rounded bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-negative)]"
              style={{ width: `${gastoPct}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-[var(--color-text-dim)] w-20 text-right">
            {formatMoney(row.gastoMinor, currency)}
          </span>
        </div>
      </div>
    </li>
  );
}
