import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import { computeBalances } from '@/domain/balances';
import { formatMoney } from '@/db/money';

export default function Home() {
  const balances = useLiveQuery(() => computeBalances(), []);
  const importCount = useLiveQuery(() => db.imports.count(), []);
  const movementCount = useLiveQuery(() => db.movements.count(), []);

  if (importCount === 0) {
    return (
      <section className="p-4 space-y-3">
        <h2 className="text-base font-medium">Sin datos aún</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Importa tu presupuesto histórico para empezar.
        </p>
        <Link
          to="/datos"
          className="inline-block px-3 py-2 rounded bg-[var(--color-accent)] text-slate-900 text-sm font-medium"
        >
          Ir a Datos
        </Link>
      </section>
    );
  }

  const byCurrency = new Map<string, number>();
  balances?.forEach(b => byCurrency.set(b.currency, (byCurrency.get(b.currency) ?? 0) + b.balanceMinor));

  return (
    <section className="p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">Saldo total</p>
        {[...byCurrency.entries()].map(([cur, total]) => (
          <p key={cur} className="text-2xl font-semibold tabular-nums">
            {formatMoney(total, cur as any)}
          </p>
        ))}
      </div>

      <div className="text-xs text-[var(--color-text-dim)]">
        {movementCount ?? 0} movimientos
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/nuevo"
          className="p-4 rounded-lg bg-[var(--color-accent)] text-slate-900 text-center font-medium"
        >
          + Nuevo movimiento
        </Link>
        <Link
          to="/cuentas"
          className="p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-center"
        >
          Cuentas
        </Link>
        <Link
          to="/anio"
          className="p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-center col-span-2"
        >
          Vista anual
        </Link>
      </div>
    </section>
  );
}
