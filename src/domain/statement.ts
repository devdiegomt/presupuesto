import { db } from '@/db/schema';
import type { Movement } from '@/db/types';

export interface StatementRow {
  movement: Movement;
  signedMinor: number;
  runningMinor: number;
  counterpartyAccountId?: string;
}

export interface Statement {
  accountId: string;
  rows: StatementRow[];
  totalMinor: number;
}

function affectsAccount(m: Movement, accountId: string): boolean {
  if (m.accountId === accountId) return true;
  if (m.kind === 'transferencia' && (m.fromAccountId === accountId || m.toAccountId === accountId)) return true;
  return false;
}

function signedForAccount(m: Movement, accountId: string): number {
  if (m.kind === 'transferencia') {
    if (m.fromAccountId === accountId) return -m.amountMinor;
    if (m.toAccountId === accountId) return m.toAmountMinor ?? m.amountMinor;
    return 0;
  }
  return m.amountMinor;
}

function counterparty(m: Movement, accountId: string): string | undefined {
  if (m.kind !== 'transferencia') return undefined;
  return m.fromAccountId === accountId ? m.toAccountId : m.fromAccountId;
}

export async function computeStatement(accountId: string): Promise<Statement> {
  const all = await db.movements.toArray();
  const filtered = all.filter(m => affectsAccount(m, accountId));

  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  const rows: StatementRow[] = [];
  let running = 0;
  for (const m of filtered) {
    const signed = signedForAccount(m, accountId);
    running += signed;
    rows.push({
      movement: m,
      signedMinor: signed,
      runningMinor: running,
      counterpartyAccountId: counterparty(m, accountId),
    });
  }

  return { accountId, rows, totalMinor: running };
}
