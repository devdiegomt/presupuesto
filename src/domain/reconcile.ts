import { db } from '@/db/schema';
import { newId } from '@/db/ids';
import type { Currency, Movement, Reconciliation } from '@/db/types';

export async function computeBalanceAsOf(accountId: string, asOfDate: string): Promise<number> {
  const all = await db.movements.toArray();
  let balance = 0;
  for (const m of all) {
    if (m.date > asOfDate) continue;
    if (m.kind === 'transferencia') {
      if (m.fromAccountId === accountId) balance -= m.amountMinor;
      if (m.toAccountId === accountId) balance += m.toAmountMinor ?? m.amountMinor;
    } else if (m.accountId === accountId) {
      balance += m.amountMinor;
    }
  }
  return balance;
}

export interface CreateReconciliationInput {
  accountId: string;
  currency: Currency;
  date: string;
  declaredBalanceMinor: number;
  note?: string;
  adjustmentDescription?: string;
}

export interface ReconciliationResult {
  reconciliation: Reconciliation;
  adjustment: Movement | null;
}

export async function createReconciliation(
  input: CreateReconciliationInput,
): Promise<ReconciliationResult> {
  const now = new Date().toISOString();
  const computed = await computeBalanceAsOf(input.accountId, input.date);
  const delta = input.declaredBalanceMinor - computed;
  const reconciliationId = newId();

  const reconciliation: Reconciliation = {
    id: reconciliationId,
    accountId: input.accountId,
    date: input.date,
    declaredBalanceMinor: input.declaredBalanceMinor,
    computedBalanceMinor: computed,
    deltaMinor: delta,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  let adjustment: Movement | null = null;
  if (delta !== 0) {
    adjustment = {
      id: newId(),
      date: input.date,
      month: input.date.slice(0, 7),
      description: (input.adjustmentDescription || 'Desface').trim(),
      currency: input.currency,
      amountMinor: delta,
      kind: 'ajuste',
      accountId: input.accountId,
      reconciliationId,
      createdAt: now,
      updatedAt: now,
    };
  }

  await db.transaction('rw', [db.reconciliations, db.movements], async () => {
    await db.reconciliations.put(reconciliation);
    if (adjustment) await db.movements.put(adjustment);
  });

  return { reconciliation, adjustment };
}
