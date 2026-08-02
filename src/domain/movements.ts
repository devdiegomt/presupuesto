import { db } from '@/db/schema';
import { txWithTombstones } from '@/db/hooks';
import { newId } from '@/db/ids';
import { toMinor } from '@/db/money';
import type { Currency, Movement } from '@/db/types';

export interface NewGastoOrIngreso {
  kind: 'gasto' | 'ingreso';
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  accountId: string;
  subtemaId: string;
}

export interface NewTransferencia {
  kind: 'transferencia';
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  fromAccountId: string;
  toAccountId: string;
  toAmount?: number;
  toCurrency?: Currency;
  note?: string;
}

export interface NewAjuste {
  kind: 'ajuste';
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  accountId: string;
  reconciliationId: string;
}

export type NewMovementInput = NewGastoOrIngreso | NewTransferencia | NewAjuste;

type MovementCore = Omit<Movement, 'id' | 'createdAt' | 'updatedAt' | 'legacyId' | 'flags'>;

function buildCore(input: NewMovementInput): MovementCore {
  const base = {
    date: input.date,
    month: input.date.slice(0, 7),
    description: input.description.trim(),
    currency: input.currency,
    kind: input.kind,
    amountMinor: 0,
  };
  switch (input.kind) {
    case 'gasto':
      return {
        ...base,
        amountMinor: -Math.abs(toMinor(input.amount, input.currency)),
        accountId: input.accountId,
        subtemaId: input.subtemaId,
      };
    case 'ingreso':
      return {
        ...base,
        amountMinor: Math.abs(toMinor(input.amount, input.currency)),
        accountId: input.accountId,
        subtemaId: input.subtemaId,
      };
    case 'transferencia': {
      const isBi = !!input.toCurrency && input.toCurrency !== input.currency;
      return {
        ...base,
        amountMinor: Math.abs(toMinor(input.amount, input.currency)),
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        toAmountMinor:
          isBi && input.toAmount != null
            ? Math.abs(toMinor(input.toAmount, input.toCurrency!))
            : undefined,
        toCurrency: isBi ? input.toCurrency : undefined,
        note: input.note?.trim() || undefined,
      };
    }
    case 'ajuste':
      return {
        ...base,
        amountMinor: input.amountMinor,
        accountId: input.accountId,
        reconciliationId: input.reconciliationId,
      };
  }
}

export async function createMovement(input: NewMovementInput): Promise<Movement> {
  const now = new Date().toISOString();
  const rec: Movement = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...buildCore(input),
  };
  await db.movements.put(rec);
  return rec;
}

export async function updateMovement(id: string, input: NewMovementInput): Promise<Movement> {
  const existing = await db.movements.get(id);
  if (!existing) throw new Error(`Movimiento ${id} no existe`);
  const now = new Date().toISOString();
  const rec: Movement = {
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
    legacyId: existing.legacyId,
    flags: existing.flags,
    ...buildCore(input),
  };
  await db.movements.put(rec);
  return rec;
}

export async function deleteMovement(id: string): Promise<void> {
  const existing = await db.movements.get(id);
  if (!existing) return;
  await txWithTombstones([db.movements, db.reconciliations], async () => {
    await db.movements.delete(id);
    if (existing.kind === 'ajuste' && existing.reconciliationId) {
      await db.reconciliations.delete(existing.reconciliationId);
    }
  });
}
