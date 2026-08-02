import { db } from '@/db/schema';
import { txWithTombstones } from '@/db/hooks';
import { budgetId } from '@/db/ids';
import type { Budget, Currency } from '@/db/types';

export async function upsertBudget(
  month: string,
  subtemaId: string,
  previstoMinor: number,
  currency: Currency,
): Promise<Budget | null> {
  const id = budgetId(month, subtemaId);
  if (previstoMinor <= 0) {
    await txWithTombstones([db.budgets], async () => {
      await db.budgets.delete(id);
    });
    return null;
  }
  const rec: Budget = {
    id,
    month,
    subtemaId,
    previstoMinor,
    currency,
    updatedAt: new Date().toISOString(),
  };
  await db.budgets.put(rec);
  return rec;
}

export async function deleteBudget(month: string, subtemaId: string): Promise<void> {
  await txWithTombstones([db.budgets], async () => {
    await db.budgets.delete(budgetId(month, subtemaId));
  });
}

export interface CopyBudgetResult {
  copied: number;
  skipped: number;
}

export async function copyBudget(
  fromMonth: string,
  toMonth: string,
  currency: Currency,
  overwrite = false,
): Promise<CopyBudgetResult> {
  if (fromMonth === toMonth) return { copied: 0, skipped: 0 };
  const source = await db.budgets
    .where('month')
    .equals(fromMonth)
    .filter(b => b.currency === currency)
    .toArray();
  const existing = await db.budgets
    .where('month')
    .equals(toMonth)
    .filter(b => b.currency === currency)
    .toArray();
  const existingIds = new Set(existing.map(b => b.subtemaId));

  const toWrite: Budget[] = [];
  let skipped = 0;
  for (const b of source) {
    if (!overwrite && existingIds.has(b.subtemaId)) {
      skipped += 1;
      continue;
    }
    toWrite.push({
      id: budgetId(toMonth, b.subtemaId),
      month: toMonth,
      subtemaId: b.subtemaId,
      previstoMinor: b.previstoMinor,
      currency,
      updatedAt: new Date().toISOString(),
    });
  }
  if (toWrite.length) await db.budgets.bulkPut(toWrite);
  return { copied: toWrite.length, skipped };
}

export async function budgetMonthsWithData(currency: Currency): Promise<string[]> {
  const all = await db.budgets.toArray();
  return [...new Set(all.filter(b => b.currency === currency).map(b => b.month))].sort();
}
