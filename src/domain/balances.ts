import { db } from '@/db/schema';
import type { Currency } from '@/db/types';

export interface AccountBalance {
  accountId: string;
  name: string;
  currency: Currency;
  balanceMinor: number;
}

export async function computeBalances(): Promise<AccountBalance[]> {
  const [accounts, movements] = await Promise.all([
    db.accounts.toArray(),
    db.movements.toArray(),
  ]);

  const totals = new Map<string, number>(accounts.map(a => [a.id, 0]));

  for (const m of movements) {
    if (m.kind === 'transferencia') {
      if (m.fromAccountId) totals.set(m.fromAccountId, (totals.get(m.fromAccountId) ?? 0) - m.amountMinor);
      if (m.toAccountId) {
        const credit = m.toAmountMinor ?? m.amountMinor;
        totals.set(m.toAccountId, (totals.get(m.toAccountId) ?? 0) + credit);
      }
    } else if (m.accountId) {
      totals.set(m.accountId, (totals.get(m.accountId) ?? 0) + m.amountMinor);
    }
  }

  return accounts.map(a => ({
    accountId: a.id,
    name: a.name,
    currency: a.currency,
    balanceMinor: totals.get(a.id) ?? 0,
  }));
}
