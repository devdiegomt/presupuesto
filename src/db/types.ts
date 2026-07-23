export type Currency = 'COP' | 'BRL';
export type Kind = 'gasto' | 'ingreso' | 'transferencia' | 'ajuste' | 'nota';

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  archived?: boolean;
  createdAt: string;
}

export interface Tema {
  id: string;
  name: string;
}

export interface Subtema {
  id: string;
  name: string;
  temaId: string;
}

export interface Movement {
  id: string;
  date: string;
  month: string;
  description: string;
  currency: Currency;
  amountMinor: number;
  kind: Kind;
  accountId?: string;
  subtemaId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  toAmountMinor?: number;
  toCurrency?: Currency;
  reconciliationId?: string;
  note?: string;
  flags?: string[];
  legacyId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  month: string;
  subtemaId: string;
  previstoMinor: number;
  currency: Currency;
}

export interface Reconciliation {
  id: string;
  accountId: string;
  date: string;
  declaredBalanceMinor: number;
  computedBalanceMinor: number;
  deltaMinor: number;
  note?: string;
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  source: string;
  importedAt: string;
  counts: {
    movements: number;
    budgets: number;
    accounts: number;
    subtemas: number;
    temas: number;
  };
  meta: unknown;
}

export type ImportIssueKind =
  | 'unknown-subtema'
  | 'tema-mismatch'
  | 'account-missing'
  | 'flag'
  | 'other';

export interface ImportIssue {
  id?: number;
  importId: string;
  kind: ImportIssueKind;
  movementLegacyId?: number;
  detail: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface MonthClosureSnapshot {
  grandPrevistoMinor: number;
  grandRealMinor: number;
  temas: Array<{
    temaId: string;
    name: string;
    previstoMinor: number;
    realMinor: number;
  }>;
  sinPresupuestoMinor: number;
  balancesByAccount: Array<{
    accountId: string;
    name: string;
    balanceMinor: number;
  }>;
}

export interface MonthClosure {
  id: string;
  month: string;
  currency: Currency;
  closedAt: string;
  note?: string;
  snapshot: MonthClosureSnapshot;
}
