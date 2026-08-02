import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import { computeBalances } from '@/domain/balances';
import { formatMoney } from '@/db/money';

export default function Home() {
  const balances = useLiveQuery(() => computeBalances(), []);
  const movementCount = useLiveQuery(() => db.movements.count(), []);
  const accountCount = useLiveQuery(() => db.accounts.count(), []);

  // Ojo: acá NO sirve mirar `db.imports`. Esa tabla es la bitácora del
  // importador y a propósito no se sincroniza, así que en un dispositivo que
  // recibió todo por sync está vacía — y esta pantalla decía "sin datos" con
  // miles de movimientos cargados.
  //
  // `undefined` es "todavía cargando": solo se muestra el vacío cuando de
  // verdad sabemos que no hay nada, si no parpadea en cada arranque.
  const isEmpty = movementCount === 0 && accountCount === 0;

  if (isEmpty) {
    return (
      <section className="p-4 space-y-3">
        <h2 className="text-base font-medium">Sin datos aún</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Importa tu presupuesto histórico, o iniciá sesión para bajar lo que ya
          tengas sincronizado.
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
