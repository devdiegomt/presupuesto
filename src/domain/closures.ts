import { db } from '@/db/schema';
import { computeMonthSummary } from './monthly';
import { computeBalanceAsOf } from './reconcile';
import type { Currency, MonthClosure, MonthClosureSnapshot } from '@/db/types';

function closureId(month: string, currency: Currency): string {
  return `${month}|${currency}`;
}

export function lastDayOfMonth(month: string): string {
  const parts = month.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

async function buildSnapshot(month: string, currency: Currency): Promise<MonthClosureSnapshot> {
  const summary = await computeMonthSummary(month, currency);
  const accounts = (await db.accounts.toArray()).filter(a => a.currency === currency);
  const balancesByAccount = await Promise.all(
    accounts.map(async a => ({
      accountId: a.id,
      name: a.name,
      balanceMinor: await computeBalanceAsOf(a.id, lastDayOfMonth(month)),
    })),
  );
  return {
    grandPrevistoMinor: summary.grandPrevistoMinor,
    grandRealMinor: summary.grandRealMinor,
    temas: summary.temas.map(t => ({
      temaId: t.temaId,
      name: t.name,
      previstoMinor: t.previstoMinor,
      realMinor: t.realMinor,
    })),
    sinPresupuestoMinor: summary.sinPresupuesto.reduce((s, u) => s + u.realMinor, 0),
    balancesByAccount,
  };
}

export async function closeMonth(
  month: string,
  currency: Currency,
  note?: string,
): Promise<MonthClosure> {
  const snapshot = await buildSnapshot(month, currency);
  const rec: MonthClosure = {
    id: closureId(month, currency),
    month,
    currency,
    closedAt: new Date().toISOString(),
    note: note?.trim() || undefined,
    snapshot,
  };
  await db.monthClosures.put(rec);
  return rec;
}

export async function reopenMonth(month: string, currency: Currency): Promise<void> {
  await db.monthClosures.delete(closureId(month, currency));
}

export async function getClosure(
  month: string,
  currency: Currency,
): Promise<MonthClosure | undefined> {
  return db.monthClosures.get(closureId(month, currency));
}

export interface ClosureDrift {
  grandPrevistoDelta: number;
  grandRealDelta: number;
  sinPresupuestoDelta: number;
  hasDrift: boolean;
}

export async function computeClosureDrift(closure: MonthClosure): Promise<ClosureDrift> {
  const current = await computeMonthSummary(closure.month, closure.currency);
  const currentSinPresupuesto = current.sinPresupuesto.reduce((s, u) => s + u.realMinor, 0);
  const grandPrevistoDelta = current.grandPrevistoMinor - closure.snapshot.grandPrevistoMinor;
  const grandRealDelta = current.grandRealMinor - closure.snapshot.grandRealMinor;
  const sinPresupuestoDelta = currentSinPresupuesto - closure.snapshot.sinPresupuestoMinor;
  return {
    grandPrevistoDelta,
    grandRealDelta,
    sinPresupuestoDelta,
    hasDrift: grandPrevistoDelta !== 0 || grandRealDelta !== 0 || sinPresupuestoDelta !== 0,
  };
}
