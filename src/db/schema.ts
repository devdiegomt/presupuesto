import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  ImportIssue,
  ImportRecord,
  MonthClosure,
  Movement,
  Reconciliation,
  Setting,
  Subtema,
  Tema,
} from './types';

export class PresupuestoDB extends Dexie {
  accounts!: Table<Account, string>;
  temas!: Table<Tema, string>;
  subtemas!: Table<Subtema, string>;
  movements!: Table<Movement, string>;
  budgets!: Table<Budget, string>;
  reconciliations!: Table<Reconciliation, string>;
  imports!: Table<ImportRecord, string>;
  importIssues!: Table<ImportIssue, number>;
  settings!: Table<Setting, string>;
  monthClosures!: Table<MonthClosure, string>;

  constructor() {
    super('presupuesto');
    this.version(1).stores({
      accounts:
        'id, currency, archived',
      temas:
        'id, name',
      subtemas:
        'id, temaId, name',
      movements:
        'id, date, month, kind, accountId, subtemaId, fromAccountId, toAccountId, reconciliationId, [month+kind], [accountId+date], [subtemaId+month]',
      budgets:
        'id, month, subtemaId, [month+subtemaId]',
      reconciliations:
        'id, accountId, date',
      imports:
        'id, importedAt, source',
      importIssues:
        '++id, importId, kind',
      settings:
        'key',
    });
    this.version(2).stores({
      monthClosures:
        'id, month, currency, closedAt, [month+currency]',
    });
  }
}

export const db = new PresupuestoDB();
