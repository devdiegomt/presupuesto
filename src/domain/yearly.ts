import { db } from '@/db/schema';
import { computeBalanceAsOf } from './reconcile';
import { lastDayOfMonth } from './closures';
import type { Currency } from '@/db/types';

export interface YearMonthRow {
  month: string;
  ingresoMinor: number;
  gastoMinor: number;
  netoMinor: number;
  closedAt?: string;
}

export interface YearTemaRow {
  temaId: string;
  name: string;
  realMinor: number;
  share: number;
}

export interface YearAccountRow {
  accountId: string;
  name: string;
  monthlySaldos: number[];
}

export interface YearSummary {
  year: string;
  currency: Currency;
  months: YearMonthRow[];
  temas: YearTemaRow[];
  accounts: YearAccountRow[];
  totalIngresoMinor: number;
  totalGastoMinor: number;
  totalNetoMinor: number;
  availableYears: string[];
}

export async function computeYearSummary(
  year: string,
  currency: Currency,
): Promise<YearSummary> {
  const [movements, accounts, subtemas, temas, closures] = await Promise.all([
    db.movements.toArray(),
    db.accounts.toArray(),
    db.subtemas.toArray(),
    db.temas.toArray(),
    db.monthClosures.toArray(),
  ]);

  const availableYears = [...new Set(movements.map(m => m.month.slice(0, 4)))].sort();

  const temaById = new Map(temas.map(t => [t.id, t]));
  const subtemaToTema = new Map(subtemas.map(s => [s.id, s.temaId]));

  const monthKeys = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`,
  );

  const monthMap = new Map<string, YearMonthRow>();
  for (const k of monthKeys) {
    monthMap.set(k, { month: k, ingresoMinor: 0, gastoMinor: 0, netoMinor: 0 });
  }

  const temaTotals = new Map<string, number>();

  for (const m of movements) {
    if (m.currency !== currency) continue;
    if (!m.month.startsWith(year)) continue;
    const row = monthMap.get(m.month);
    if (!row) continue;

    if (m.kind === 'ingreso') {
      row.ingresoMinor += m.amountMinor;
    } else if (m.kind === 'gasto') {
      row.gastoMinor += Math.abs(m.amountMinor);
    } else if (m.kind === 'ajuste') {
      if (m.amountMinor > 0) row.ingresoMinor += m.amountMinor;
      else row.gastoMinor += Math.abs(m.amountMinor);
    }

    if ((m.kind === 'gasto' || m.kind === 'ingreso') && m.subtemaId) {
      const temaId = subtemaToTema.get(m.subtemaId);
      if (temaId) {
        temaTotals.set(temaId, (temaTotals.get(temaId) ?? 0) + Math.abs(m.amountMinor));
      }
    }
  }

  const closureByMonth = new Map(
    closures.filter(c => c.currency === currency).map(c => [c.month, c]),
  );

  const months: YearMonthRow[] = monthKeys.map(k => {
    const row = monthMap.get(k)!;
    row.netoMinor = row.ingresoMinor - row.gastoMinor;
    const c = closureByMonth.get(k);
    if (c) row.closedAt = c.closedAt;
    return row;
  });

  const totalReal = [...temaTotals.values()].reduce((s, v) => s + v, 0);
  const temaRows: YearTemaRow[] = [...temaTotals.entries()]
    .map(([id, real]) => ({
      temaId: id,
      name: temaById.get(id)?.name ?? id,
      realMinor: real,
      share: totalReal > 0 ? real / totalReal : 0,
    }))
    .sort((a, b) => b.realMinor - a.realMinor);

  const relevantAccounts = accounts.filter(a => a.currency === currency);
  const accountRows: YearAccountRow[] = await Promise.all(
    relevantAccounts.map(async a => ({
      accountId: a.id,
      name: a.name,
      monthlySaldos: await Promise.all(
        monthKeys.map(k => computeBalanceAsOf(a.id, lastDayOfMonth(k))),
      ),
    })),
  );

  const totalIngresoMinor = months.reduce((s, m) => s + m.ingresoMinor, 0);
  const totalGastoMinor = months.reduce((s, m) => s + m.gastoMinor, 0);

  return {
    year,
    currency,
    months,
    temas: temaRows,
    accounts: accountRows,
    totalIngresoMinor,
    totalGastoMinor,
    totalNetoMinor: totalIngresoMinor - totalGastoMinor,
    availableYears,
  };
}
