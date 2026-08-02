import { db } from '@/db/schema';
import { txWithTombstones } from '@/db/hooks';
import { slug } from '@/db/ids';
import type { Account, Currency } from '@/db/types';

export interface CreateAccountInput {
  name: string;
  currency: Currency;
}

async function uniqueAccountId(base: string): Promise<string> {
  if (!(await db.accounts.get(base))) return base;
  let n = 2;
  while (await db.accounts.get(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createAccount({ name, currency }: CreateAccountInput): Promise<Account> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre es obligatorio');
  const base = slug(trimmed) || 'cuenta';
  const id = await uniqueAccountId(base);
  const nowIso = new Date().toISOString();
  const acc: Account = {
    id,
    name: trimmed,
    currency,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.accounts.put(acc);
  return acc;
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'archived'>>,
): Promise<Account> {
  const existing = await db.accounts.get(id);
  if (!existing) throw new Error(`Cuenta ${id} no existe`);
  const updated: Account = {
    ...existing,
    ...patch,
    name: patch.name?.trim() || existing.name,
  };
  await db.accounts.put(updated);
  return updated;
}

export async function accountUsage(id: string): Promise<number> {
  const [asAccount, asFrom, asTo] = await Promise.all([
    db.movements.where('accountId').equals(id).count(),
    db.movements.where('fromAccountId').equals(id).count(),
    db.movements.where('toAccountId').equals(id).count(),
  ]);
  return asAccount + asFrom + asTo;
}

export async function deleteAccount(id: string): Promise<void> {
  const usage = await accountUsage(id);
  if (usage > 0) {
    throw new Error(`Cuenta con ${usage} movimientos; archívala en su lugar`);
  }
  await txWithTombstones([db.accounts], async () => {
    await db.accounts.delete(id);
  });
}
