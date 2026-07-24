import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  computeMonthSummary,
  type MonthBlock,
  type SubtemaRow,
  type TemaRow,
} from '@/domain/monthly';
import {
  closeMonth,
  computeClosureDrift,
  getClosure,
  reopenMonth,
  type ClosureDrift,
} from '@/domain/closures';
import { formatMoney } from '@/db/money';
import type { Currency, MonthClosure } from '@/db/types';

const today = () => new Date().toISOString().slice(0, 7);

export default function MonthView() {
  const { ym } = useParams();
  const navigate = useNavigate();

  const [currency, setCurrency] = useState<Currency>('COP');

  const summary = useLiveQuery(() => {
    const target = ym ?? today();
    return computeMonthSummary(target, currency);
  }, [ym, currency]);

  const availableMonths = summary?.availableMonths ?? [];
  const availableCurrencies = summary?.availableCurrencies ?? [];

  const targetMonth = ym ?? availableMonths[availableMonths.length - 1] ?? today();
  const closure = useLiveQuery(
    () => getClosure(targetMonth, currency),
    [targetMonth, currency],
  );
  const drift = useLiveQuery(
    () => (closure ? computeClosureDrift(closure) : Promise.resolve(null)),
    [closure?.id, summary],
  );

  useEffect(() => {
    if (!ym && availableMonths.length > 0) {
      const latest = availableMonths[availableMonths.length - 1]!;
      navigate(`/mes/${latest}`, { replace: true });
    }
  }, [ym, availableMonths, navigate]);

  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(currency)) {
      setCurrency(availableCurrencies[0]!);
    }
  }, [availableCurrencies, currency]);

  if (!summary) return <section className="p-4">Cargando…</section>;

  if (availableMonths.length === 0) {
    return (
      <section className="p-4 text-sm text-[var(--color-text-dim)]">
        No hay movimientos aún.
      </section>
    );
  }

  const selected = ym ?? availableMonths[availableMonths.length - 1]!;
  const netFlow = summary.ingresos.grandRealMinor - summary.gastos.grandRealMinor;
  const hasGastos = summary.gastos.temas.length > 0 || summary.gastos.sinPresupuesto.length > 0;
  const hasIngresos = summary.ingresos.temas.length > 0;

  return (
    <section className="p-4 space-y-4">
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <select
          value={selected}
          onChange={e => navigate(`/mes/${e.target.value}`)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
        >
          {[...availableMonths].reverse().map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className="flex gap-2 items-center">
          {availableCurrencies.length > 1 && (
            <div className="flex gap-1">
              {availableCurrencies.map(c => (
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
          )}
          <Link
            to={`/presupuesto/${selected}`}
            className="px-2 py-1 rounded text-xs bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            Editar presupuesto
          </Link>
          <Link
            to={`/anio/${selected.slice(0, 4)}`}
            className="px-2 py-1 rounded text-xs bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            Año {selected.slice(0, 4)}
          </Link>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 gap-2">
        <BlockTotalsCard label="Gastos" block={summary.gastos} currency={currency} kind="gasto" />
        <BlockTotalsCard label="Ingresos" block={summary.ingresos} currency={currency} kind="ingreso" />
      </div>
      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">Flujo neto</p>
        <p
          className={`text-lg font-semibold tabular-nums ${
            netFlow < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-positive)]'
          }`}
        >
          {formatMoney(netFlow, currency)}
        </p>
      </div>

      <ClosureCard
        month={selected}
        currency={currency}
        closure={closure ?? null}
        drift={drift ?? null}
      />

      {!hasGastos && !hasIngresos ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          Nada registrado en {selected} ({currency}).
        </p>
      ) : (
        <>
          {hasGastos && (
            <TemaSection block={summary.gastos} title="Gastos" currency={currency} />
          )}
          {hasIngresos && (
            <TemaSection block={summary.ingresos} title="Ingresos" currency={currency} />
          )}
        </>
      )}
    </section>
  );
}

function TemaSection({
  block,
  title,
  currency,
}: {
  block: MonthBlock;
  title: string;
  currency: Currency;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--color-text-dim)]">{title}</h3>
      <ul className="space-y-2">
        {block.temas.map(t => (
          <TemaItem key={t.temaId} tema={t} currency={currency} />
        ))}
      </ul>
      {block.sinPresupuesto.length > 0 && (
        <div className="space-y-1 pt-2">
          <h4 className="text-xs font-medium text-[var(--color-warn)]">Sin presupuesto</h4>
          <ul className="space-y-1">
            {block.sinPresupuesto.map(u => (
              <li
                key={u.subtemaId}
                className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between text-sm"
              >
                <span>
                  {u.name}
                  <span className="text-[var(--color-text-dim)] text-xs"> · {u.movementCount} mov</span>
                </span>
                <span className="tabular-nums">{formatMoney(u.realMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BlockTotalsCard({
  label,
  block,
  currency,
  kind,
}: {
  label: string;
  block: MonthBlock;
  currency: Currency;
  kind: 'gasto' | 'ingreso';
}) {
  const diff = block.grandPrevistoMinor > 0 ? block.grandPrevistoMinor - block.grandRealMinor : 0;
  const isGasto = kind === 'gasto';
  const overBudget = isGasto && diff < 0;
  const underIngreso = !isGasto && block.grandPrevistoMinor > 0 && diff > 0;

  let tail: React.ReactNode = null;
  if (block.grandPrevistoMinor > 0) {
    if (isGasto) {
      tail = (
        <p
          className={`text-xs ${
            overBudget ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-dim)]'
          }`}
        >
          {overBudget ? 'Sobregasto: ' : 'Margen: '}
          <span className="tabular-nums">{formatMoney(Math.abs(diff), currency)}</span>
        </p>
      );
    } else {
      tail = (
        <p
          className={`text-xs ${
            underIngreso ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-dim)]'
          }`}
        >
          {underIngreso ? 'Faltante: ' : 'Extra: '}
          <span className="tabular-nums">{formatMoney(Math.abs(diff), currency)}</span>
        </p>
      );
    }
  }

  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase text-[var(--color-text-dim)]">Real</p>
          <p
            className={`text-base font-semibold tabular-nums ${
              isGasto ? 'text-[var(--color-negative)]' : 'text-[var(--color-positive)]'
            }`}
          >
            {formatMoney(block.grandRealMinor, currency)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[var(--color-text-dim)]">Previsto</p>
          <p className="text-base font-semibold tabular-nums">
            {formatMoney(block.grandPrevistoMinor, currency)}
          </p>
        </div>
      </div>
      {tail}
    </div>
  );
}

function TemaItem({ tema, currency }: { tema: TemaRow; currency: Currency }) {
  const [open, setOpen] = useState(false);
  const over = tema.realMinor > tema.previstoMinor && tema.previstoMinor > 0;

  return (
    <li className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full p-3 flex items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium truncate">{tema.name}</span>
            <span className="text-[var(--color-text-dim)] text-xs">
              {tema.subtemas.length} subtema{tema.subtemas.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ProgressBar
            realMinor={tema.realMinor}
            previstoMinor={tema.previstoMinor}
            over={over}
          />
        </div>
        <div className="text-right">
          <div className="text-sm tabular-nums">
            {formatMoney(tema.realMinor, currency)}
          </div>
          <div className="text-xs text-[var(--color-text-dim)] tabular-nums">
            / {formatMoney(tema.previstoMinor, currency)}
          </div>
        </div>
      </button>

      {open && (
        <ul className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {tema.subtemas.map(s => (
            <SubtemaLine key={s.subtemaId} row={s} currency={currency} kind={tema.kind} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SubtemaLine({
  row,
  currency,
  kind,
}: {
  row: SubtemaRow;
  currency: Currency;
  kind: 'gasto' | 'ingreso';
}) {
  const over = row.realMinor > row.previstoMinor && row.previstoMinor > 0;
  const diffColor =
    row.diffMinor < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-dim)]';
  const overWord = kind === 'gasto' ? 'Sobregasto' : 'Extra';
  const underWord = kind === 'gasto' ? 'Margen' : 'Faltante';
  return (
    <li className="p-3 flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate">{row.name}</p>
        <ProgressBar
          realMinor={row.realMinor}
          previstoMinor={row.previstoMinor}
          over={over && kind === 'gasto'}
          thin
        />
        <p className={`text-xs mt-1 ${diffColor}`}>
          {row.previstoMinor === 0
            ? `Sin presupuesto · ${row.movementCount} mov`
            : `${row.diffMinor < 0 ? overWord : underWord}: ${formatMoney(
                Math.abs(row.diffMinor),
                currency,
              )}${row.pct != null ? ` · ${Math.round(row.pct * 100)}%` : ''}`}
        </p>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="tabular-nums">{formatMoney(row.realMinor, currency)}</div>
        <div className="text-xs text-[var(--color-text-dim)] tabular-nums">
          / {formatMoney(row.previstoMinor, currency)}
        </div>
      </div>
    </li>
  );
}

function ProgressBar({
  realMinor,
  previstoMinor,
  over,
  thin,
}: {
  realMinor: number;
  previstoMinor: number;
  over: boolean;
  thin?: boolean;
}) {
  if (previstoMinor <= 0) return null;
  const pct = Math.min(100, Math.round((realMinor / previstoMinor) * 100));
  return (
    <div
      className={`mt-1 w-full rounded bg-[var(--color-surface-2)] overflow-hidden ${
        thin ? 'h-1' : 'h-1.5'
      }`}
    >
      <div
        className={`h-full ${over ? 'bg-[var(--color-negative)]' : 'bg-[var(--color-accent)]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ClosureCard({
  month,
  currency,
  closure,
  drift,
}: {
  month: string;
  currency: Currency;
  closure: MonthClosure | null;
  drift: ClosureDrift | null;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function onClose() {
    setBusy(true);
    try {
      await closeMonth(month, currency, note);
      setNote('');
    } finally {
      setBusy(false);
    }
  }
  async function onUpdate() {
    setBusy(true);
    try {
      await closeMonth(month, currency, closure?.note);
    } finally {
      setBusy(false);
    }
  }
  async function onReopen() {
    if (!confirm(`Reabrir ${month} · ${currency}? Se borrará el snapshot del cierre.`)) return;
    setBusy(true);
    try {
      await reopenMonth(month, currency);
    } finally {
      setBusy(false);
    }
  }

  if (!closure) {
    return (
      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Sin cierre</p>
          <p className="text-xs text-[var(--color-text-dim)]">{month} · {currency}</p>
        </div>
        <p className="text-xs text-[var(--color-text-dim)]">
          Al cerrar guardas los totales actuales y los saldos por cuenta a fin de mes.
        </p>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nota opcional del cierre"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-full py-2 rounded bg-[var(--color-accent)] text-slate-900 font-medium text-sm disabled:opacity-40"
        >
          Cerrar {month} · {currency}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-accent)] p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-[var(--color-accent)]">🔒 Cerrado</p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {closure.closedAt.slice(0, 10)}
        </p>
      </div>
      {closure.note && (
        <p className="text-xs text-[var(--color-text-dim)]">{closure.note}</p>
      )}

      {drift?.hasDrift && (
        <div className="rounded bg-[var(--color-surface-2)] border border-[var(--color-warn)] p-2 space-y-1">
          <p className="text-xs text-[var(--color-warn)] font-medium">Cambió tras el cierre</p>
          {drift.grandRealDelta !== 0 && (
            <p className="text-xs tabular-nums">
              Real: {drift.grandRealDelta > 0 ? '+' : ''}
              {formatMoney(drift.grandRealDelta, currency)}
            </p>
          )}
          {drift.grandPrevistoDelta !== 0 && (
            <p className="text-xs tabular-nums">
              Previsto: {drift.grandPrevistoDelta > 0 ? '+' : ''}
              {formatMoney(drift.grandPrevistoDelta, currency)}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onUpdate}
          disabled={busy || !drift?.hasDrift}
          className="py-2 rounded text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] disabled:opacity-40"
        >
          Actualizar cierre
        </button>
        <button
          type="button"
          onClick={onReopen}
          disabled={busy}
          className="py-2 rounded text-sm border border-[var(--color-negative)] text-[var(--color-negative)]"
        >
          Reabrir
        </button>
      </div>
    </div>
  );
}
