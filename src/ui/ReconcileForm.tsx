import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/db/schema';
import { formatMoney, toMinor } from '@/db/money';
import { computeBalanceAsOf, createReconciliation } from '@/domain/reconcile';
import { TextField } from './components/TextField';

const today = () => new Date().toISOString().slice(0, 10);

export default function ReconcileForm() {
  const { accountId } = useParams();
  const id = accountId ?? '';
  const navigate = useNavigate();

  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id]);
  const [date, setDate] = useState(today());
  const [declaredStr, setDeclaredStr] = useState('');
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('Desface');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const computed = useLiveQuery(
    () => (id ? computeBalanceAsOf(id, date) : undefined),
    [id, date],
  );

  if (!account) return <section className="p-4">Cargando…</section>;

  const declaredNum = parseFloat(declaredStr.replace(',', '.'));
  const declaredValid = !isNaN(declaredNum);
  const declaredMinor = declaredValid ? toMinor(declaredNum, account.currency) : 0;
  const computedMinor = computed ?? 0;
  const delta = declaredValid ? declaredMinor - computedMinor : 0;

  async function onSave() {
    if (!declaredValid) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await createReconciliation({
        accountId: id,
        currency: account!.currency,
        date,
        declaredBalanceMinor: declaredMinor,
        note,
        adjustmentDescription: description,
      });
      if (res.adjustment) {
        setMsg(
          `Ajuste creado: ${formatMoney(res.adjustment.amountMinor, account!.currency)} en ${res.adjustment.date}.`,
        );
      } else {
        setMsg('Saldo ya cuadraba — reconciliación registrada sin ajuste.');
      }
      setTimeout(() => navigate(`/cuentas/${id}`), 1400);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const deltaLabel =
    delta === 0
      ? 'Cuadra exactamente'
      : delta > 0
        ? `Falta sumar ${formatMoney(Math.abs(delta), account.currency)}`
        : `Sobra ${formatMoney(Math.abs(delta), account.currency)}`;
  const deltaColor =
    delta === 0
      ? 'text-[var(--color-positive)]'
      : delta > 0
        ? 'text-[var(--color-accent)]'
        : 'text-[var(--color-negative)]';

  return (
    <section className="p-4 space-y-5 pb-8">
      <header className="space-y-1">
        <Link to={`/cuentas/${id}`} className="text-xs text-[var(--color-accent)]">
          ← {account.name}
        </Link>
        <h2 className="text-lg font-semibold">Reconciliar</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Ingresa el saldo real de esta cuenta a una fecha; la app crea el ajuste para cuadrar.
        </p>
      </header>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Fecha del corte
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Saldo calculado hasta esta fecha
        </p>
        <p className="text-xl font-semibold tabular-nums">
          {formatMoney(computedMinor, account.currency)}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Saldo real declarado ({account.currency})
        </label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={declaredStr}
          onChange={e => setDeclaredStr(e.target.value.replace(/[^\d.,\-]/g, ''))}
          className="w-full text-3xl font-semibold tabular-nums bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-2"
        />
      </div>

      {declaredValid && (
        <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
          <p className={`text-sm ${deltaColor}`}>{deltaLabel}</p>
          {delta !== 0 && (
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Se creará un movimiento <em>ajuste</em> de{' '}
              <span className="tabular-nums">{formatMoney(delta, account.currency)}</span> con
              fecha {date}.
            </p>
          )}
        </div>
      )}

      {delta !== 0 && (
        <TextField
          label="Descripción del ajuste"
          value={description}
          onChange={setDescription}
          placeholder="Desface"
        />
      )}
      <TextField
        label="Nota (opcional)"
        value={note}
        onChange={setNote}
        placeholder="Contexto de la conciliación…"
      />

      {msg && (
        <div className="rounded bg-[var(--color-surface-2)] border border-[var(--color-accent)] px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={!declaredValid || busy}
        className="w-full py-4 rounded-lg bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
      >
        {delta === 0 && declaredValid ? 'Registrar conciliación' : 'Crear ajuste'}
      </button>
    </section>
  );
}
