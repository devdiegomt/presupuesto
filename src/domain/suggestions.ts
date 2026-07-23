import type { Kind, Movement } from '@/db/types';

export interface DescriptionEntry {
  text: string;
  date: string;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

interface Stat {
  text: string;
  norm: string;
  count: number;
  lastDate: string;
}

export function rankDescriptions(
  entries: DescriptionEntry[],
  query: string,
  limit: number,
): string[] {
  const q = normalizeText(query);
  const stats = new Map<string, Stat>();
  for (const e of entries) {
    const key = e.text.trim();
    if (!key) continue;
    const existing = stats.get(key);
    if (existing) {
      existing.count += 1;
      if (e.date > existing.lastDate) existing.lastDate = e.date;
    } else {
      stats.set(key, { text: key, norm: normalizeText(key), count: 1, lastDate: e.date });
    }
  }
  const items = [...stats.values()];
  const filtered = q ? items.filter(i => i.norm.includes(q)) : items;
  filtered.sort((a, b) => {
    if (q) {
      const aPrefix = a.norm.startsWith(q);
      const bPrefix = b.norm.startsWith(q);
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    }
    if (b.count !== a.count) return b.count - a.count;
    return b.lastDate.localeCompare(a.lastDate);
  });
  return filtered.slice(0, limit).map(i => i.text);
}

export interface AutofillSource {
  subtemaId?: string;
  accountId?: string;
}

export function findAutofillSource(
  movements: Movement[],
  description: string,
  kind: Kind,
): AutofillSource | null {
  const target = normalizeText(description);
  if (!target) return null;

  let best: Movement | null = null;
  for (const m of movements) {
    if (m.kind !== kind) continue;
    if (normalizeText(m.description) !== target) continue;
    if (!m.subtemaId && !m.accountId) continue;
    if (!best || m.date > best.date || (m.date === best.date && m.createdAt > best.createdAt)) {
      best = m;
    }
  }

  if (!best) return null;
  return {
    subtemaId: best.subtemaId,
    accountId: best.accountId,
  };
}
