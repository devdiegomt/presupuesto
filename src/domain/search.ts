import type { Currency, Kind, Movement } from '@/db/types';

export interface SearchFilters {
  q: string;
  currency: 'all' | Currency;
  kind: 'all' | Kind;
  fromDate?: string;
  toDate?: string;
}

export interface SearchIndex {
  accountName: Map<string, string>;
  subtemaName: Map<string, string>;
  temaIdBySubtema: Map<string, string>;
  temaName: Map<string, string>;
}

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function haystack(m: Movement, idx: SearchIndex): string {
  const parts: string[] = [m.description];
  if (m.accountId) {
    const n = idx.accountName.get(m.accountId);
    if (n) parts.push(n);
  }
  if (m.fromAccountId) {
    const n = idx.accountName.get(m.fromAccountId);
    if (n) parts.push(n);
  }
  if (m.toAccountId) {
    const n = idx.accountName.get(m.toAccountId);
    if (n) parts.push(n);
  }
  if (m.subtemaId) {
    const s = idx.subtemaName.get(m.subtemaId);
    if (s) parts.push(s);
    const tId = idx.temaIdBySubtema.get(m.subtemaId);
    if (tId) {
      const t = idx.temaName.get(tId);
      if (t) parts.push(t);
    }
  }
  if (m.note) parts.push(m.note);
  return normalize(parts.join(' '));
}

export function filterMovements(
  movements: Movement[],
  filters: SearchFilters,
  index: SearchIndex,
): Movement[] {
  const q = normalize(filters.q.trim());
  const out: Movement[] = [];
  for (const m of movements) {
    if (filters.currency !== 'all' && m.currency !== filters.currency) continue;
    if (filters.kind !== 'all' && m.kind !== filters.kind) continue;
    if (filters.fromDate && m.date < filters.fromDate) continue;
    if (filters.toDate && m.date > filters.toDate) continue;
    if (q && !haystack(m, index).includes(q)) continue;
    out.push(m);
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return out;
}

export interface SearchTotals {
  count: number;
  byCurrency: Array<{
    currency: Currency;
    gastoMinor: number;
    ingresoMinor: number;
    netMinor: number;
    count: number;
  }>;
}

export function summarize(movements: Movement[]): SearchTotals {
  const map = new Map<Currency, { gasto: number; ingreso: number; net: number; count: number }>();
  for (const m of movements) {
    const entry = map.get(m.currency) ?? { gasto: 0, ingreso: 0, net: 0, count: 0 };
    entry.count += 1;
    if (m.kind === 'gasto' || (m.kind === 'ajuste' && m.amountMinor < 0)) {
      entry.gasto += Math.abs(m.amountMinor);
    } else if (m.kind === 'ingreso' || (m.kind === 'ajuste' && m.amountMinor > 0)) {
      entry.ingreso += m.amountMinor;
    }
    if (m.kind !== 'transferencia') entry.net += m.amountMinor;
    map.set(m.currency, entry);
  }
  const byCurrency = [...map.entries()].map(([currency, v]) => ({
    currency,
    gastoMinor: v.gasto,
    ingresoMinor: v.ingreso,
    netMinor: v.net,
    count: v.count,
  }));
  return { count: movements.length, byCurrency };
}
