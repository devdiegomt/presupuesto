export type Currency = 'COP' | 'BRL';
export type Kind = 'gasto' | 'ingreso' | 'transferencia' | 'ajuste' | 'nota';

/**
 * Toda entidad que se sincroniza lleva `updatedAt`. El motor de sync resuelve
 * conflictos por last-write-wins sobre ese campo, y los hooks de Dexie lo
 * refrescan en cada escritura — ver src/db/hooks.ts.
 */
export interface Syncable {
  updatedAt: string;
}

export interface Account extends Syncable {
  id: string;
  name: string;
  currency: Currency;
  archived?: boolean;
  createdAt: string;
}

export type TemaKind = 'ingreso' | 'gasto';

export interface Tema extends Syncable {
  id: string;
  name: string;
  kind?: TemaKind;
}

export interface Subtema extends Syncable {
  id: string;
  name: string;
  temaId: string;
}

export interface Movement extends Syncable {
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

export interface Budget extends Syncable {
  id: string;
  month: string;
  subtemaId: string;
  previstoMinor: number;
  currency: Currency;
}

export interface Reconciliation extends Syncable {
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

export interface MonthClosure extends Syncable {
  id: string;
  month: string;
  currency: Currency;
  closedAt: string;
  note?: string;
  snapshot: MonthClosureSnapshot;
}

/**
 * Memoria de deletes que todavía no se subieron. Sin esto, borrar una fila
 * localmente sería invisible para el servidor y el siguiente pull la revivría.
 */
export interface SyncTombstone {
  id?: number;
  tableName: string;
  rowId: string;
  deletedAt: string;
}
