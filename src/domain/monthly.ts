import { db } from '@/db/schema';
import type { Currency, TemaKind } from '@/db/types';

export interface SubtemaRow {
  subtemaId: string;
  name: string;
  previstoMinor: number;
  realMinor: number;
  diffMinor: number;
  pct: number | null;
  movementCount: number;
}

export interface TemaRow {
  temaId: string;
  name: string;
  kind: TemaKind;
  previstoMinor: number;
  realMinor: number;
  diffMinor: number;
  pct: number | null;
  subtemas: SubtemaRow[];
}

export interface UnbudgetedRow {
  subtemaId: string;
  name: string;
  realMinor: number;
  movementCount: number;
}

export interface MonthBlock {
  kind: TemaKind;
  temas: TemaRow[];
  sinPresupuesto: UnbudgetedRow[];
  grandPrevistoMinor: number;
  grandRealMinor: number;
}

export interface MonthSummary {
  month: string;
  currency: Currency;
  gastos: MonthBlock;
  ingresos: MonthBlock;
  availableMonths: string[];
  availableCurrencies: Currency[];
}

function pct(real: number, previsto: number): number | null {
  if (previsto === 0) return null;
  return real / previsto;
}

export async function computeMonthSummary(month: string, currency: Currency): Promise<MonthSummary> {
  const [temas, subtemas, movements, budgets] = await Promise.all([
    db.temas.toArray(),
    db.subtemas.toArray(),
    db.movements.toArray(),
    db.budgets.toArray(),
  ]);

  const temaById = new Map(temas.map(t => [t.id, t]));
  const subtemaById = new Map(subtemas.map(s => [s.id, s]));
  const temaKindOf = (temaId: string): TemaKind =>
    temaById.get(temaId)?.kind ?? 'gasto';

  const availableMonths = [...new Set(movements.map(m => m.month))].sort();
  const availableCurrencies = [...new Set(movements.map(m => m.currency))] as Currency[];

  const relevantMovs = movements.filter(
    m =>
      m.month === month &&
      m.currency === currency &&
      m.subtemaId &&
      (m.kind === 'gasto' || m.kind === 'ingreso'),
  );

  const realBySubtema = new Map<string, { real: number; count: number }>();
  for (const m of relevantMovs) {
    const entry = realBySubtema.get(m.subtemaId!) ?? { real: 0, count: 0 };
    entry.real += Math.abs(m.amountMinor);
    entry.count += 1;
    realBySubtema.set(m.subtemaId!, entry);
  }

  const previstoBySubtema = new Map<string, number>();
  for (const b of budgets) {
    if (b.month !== month || b.currency !== currency) continue;
    previstoBySubtema.set(b.subtemaId, (previstoBySubtema.get(b.subtemaId) ?? 0) + b.previstoMinor);
  }

  const allSubtemaIds = new Set<string>([
    ...previstoBySubtema.keys(),
    ...realBySubtema.keys(),
  ]);

  const rowsByTema = new Map<string, SubtemaRow[]>();
  const unbudgeted: { row: UnbudgetedRow; kind: TemaKind }[] = [];

  for (const sid of allSubtemaIds) {
    const st = subtemaById.get(sid);
    if (!st) {
      const r = realBySubtema.get(sid);
      if (r) {
        unbudgeted.push({
          row: {
            subtemaId: sid,
            name: sid.startsWith('unknown--') ? sid.slice('unknown--'.length) : sid,
            realMinor: r.real,
            movementCount: r.count,
          },
          kind: 'gasto',
        });
      }
      continue;
    }
    const previsto = previstoBySubtema.get(sid) ?? 0;
    const realEntry = realBySubtema.get(sid) ?? { real: 0, count: 0 };
    const row: SubtemaRow = {
      subtemaId: sid,
      name: st.name,
      previstoMinor: previsto,
      realMinor: realEntry.real,
      diffMinor: previsto - realEntry.real,
      pct: pct(realEntry.real, previsto),
      movementCount: realEntry.count,
    };
    const list = rowsByTema.get(st.temaId) ?? [];
    list.push(row);
    rowsByTema.set(st.temaId, list);
  }

  const gastosTemas: TemaRow[] = [];
  const ingresosTemas: TemaRow[] = [];

  for (const [temaId, subs] of rowsByTema) {
    const tema = temaById.get(temaId);
    subs.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const prev = subs.reduce((s, r) => s + r.previstoMinor, 0);
    const real = subs.reduce((s, r) => s + r.realMinor, 0);
    const kind = temaKindOf(temaId);
    const row: TemaRow = {
      temaId,
      name: tema?.name ?? temaId,
      kind,
      previstoMinor: prev,
      realMinor: real,
      diffMinor: prev - real,
      pct: pct(real, prev),
      subtemas: subs,
    };
    (kind === 'ingreso' ? ingresosTemas : gastosTemas).push(row);
  }

  gastosTemas.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  ingresosTemas.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const gastosUnbudgeted = unbudgeted
    .filter(u => u.kind === 'gasto')
    .map(u => u.row)
    .sort((a, b) => b.realMinor - a.realMinor);

  const gastos: MonthBlock = {
    kind: 'gasto',
    temas: gastosTemas,
    sinPresupuesto: gastosUnbudgeted,
    grandPrevistoMinor: gastosTemas.reduce((s, t) => s + t.previstoMinor, 0),
    grandRealMinor:
      gastosTemas.reduce((s, t) => s + t.realMinor, 0) +
      gastosUnbudgeted.reduce((s, u) => s + u.realMinor, 0),
  };

  const ingresos: MonthBlock = {
    kind: 'ingreso',
    temas: ingresosTemas,
    sinPresupuesto: [],
    grandPrevistoMinor: ingresosTemas.reduce((s, t) => s + t.previstoMinor, 0),
    grandRealMinor: ingresosTemas.reduce((s, t) => s + t.realMinor, 0),
  };

  return {
    month,
    currency,
    gastos,
    ingresos,
    availableMonths,
    availableCurrencies,
  };
}
