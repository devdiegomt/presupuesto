import { db } from '@/db/schema';
import { budgetId, newId, slug } from '@/db/ids';
import { toMinor } from '@/db/money';
import type {
  Account,
  Budget,
  Currency,
  ImportIssue,
  ImportRecord,
  Movement,
  Subtema,
  Tema,
} from '@/db/types';

interface SeedJson {
  meta: {
    source: string;
    generated: string;
    months: string[];
    movements_count: number;
  };
  accounts: Array<{ id: string; name: string; currency: Currency }>;
  catalog: {
    temas: string[];
    subtemas: Array<{ name: string; tema: string }>;
  };
  movements: Array<{
    id: number;
    month: string;
    date: string;
    description: string;
    amount: number;
    currency: Currency;
    tema: string | null;
    subtema: string | null;
    account: string | null;
    transfer: { from: string; to: string; amount: number } | null;
    flags: string[];
    kind: string;
  }>;
  budgets: Array<{ month: string; subtema: string; tema: string; previsto: number }>;
  inconsistencias_tema?: unknown[];
}

export interface ImportResult {
  importId: string;
  counts: ImportRecord['counts'];
  issues: number;
}

function normalizeMonth(dateOrMonth: string): string {
  return dateOrMonth.slice(0, 7);
}

function toKind(raw: string): Movement['kind'] {
  switch (raw) {
    case 'gasto':
    case 'ingreso':
    case 'transferencia':
    case 'ajuste':
    case 'nota':
      return raw;
    default:
      return 'nota';
  }
}

export async function importSeed(json: SeedJson): Promise<ImportResult> {
  const importId = newId();
  const now = new Date().toISOString();
  const issues: ImportIssue[] = [];

  const temas: Tema[] = json.catalog.temas.map(name => ({
    id: slug(name),
    name,
  }));
  const temaByName = new Map(temas.map(t => [t.name.toUpperCase(), t]));

  const subtemas: Subtema[] = [];
  const subtemaByName = new Map<string, Subtema>();
  for (const s of json.catalog.subtemas) {
    const tema = temaByName.get(s.tema.toUpperCase());
    if (!tema) {
      issues.push({
        importId,
        kind: 'other',
        detail: `Subtema "${s.name}" referencia tema desconocido "${s.tema}"`,
      });
      continue;
    }
    const st: Subtema = {
      id: `${tema.id}--${slug(s.name)}`,
      name: s.name,
      temaId: tema.id,
    };
    subtemas.push(st);
    subtemaByName.set(s.name.toUpperCase(), st);
  }

  const accounts: Account[] = json.accounts.map(a => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    createdAt: now,
  }));
  const accountByName = new Map(accounts.map(a => [a.name.toUpperCase(), a]));

  const resolveAccountId = (name: string | null | undefined, legacyId?: number): string | undefined => {
    if (!name) return undefined;
    const hit = accountByName.get(name.toUpperCase());
    if (hit) return hit.id;
    issues.push({
      importId,
      kind: 'account-missing',
      movementLegacyId: legacyId,
      detail: `Cuenta desconocida "${name}"`,
    });
    return undefined;
  };

  const movements: Movement[] = [];
  for (const m of json.movements) {
    const kind = toKind(m.kind);
    const month = normalizeMonth(m.date);
    let subtemaId: string | undefined;
    if (m.subtema) {
      const st = subtemaByName.get(m.subtema.toUpperCase());
      if (st) {
        subtemaId = st.id;
        if (m.tema && m.tema.toUpperCase() !== temas.find(t => t.id === st.temaId)?.name.toUpperCase()) {
          issues.push({
            importId,
            kind: 'tema-mismatch',
            movementLegacyId: m.id,
            detail: `Subtema "${m.subtema}" está bajo "${
              temas.find(t => t.id === st.temaId)?.name
            }" en catálogo, movimiento usa "${m.tema}"`,
          });
        }
      } else if (kind === 'gasto' || kind === 'ingreso') {
        issues.push({
          importId,
          kind: 'unknown-subtema',
          movementLegacyId: m.id,
          detail: `Subtema "${m.subtema}" no está en el catálogo`,
        });
      }
    }

    const rec: Movement = {
      id: newId(),
      legacyId: m.id,
      date: m.date,
      month,
      description: m.description,
      currency: m.currency,
      amountMinor: toMinor(m.amount, m.currency),
      kind,
      flags: m.flags?.length ? m.flags : undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (kind === 'transferencia' && m.transfer) {
      rec.fromAccountId = resolveAccountId(m.transfer.from, m.id);
      rec.toAccountId = resolveAccountId(m.transfer.to, m.id);
      if (m.subtema) rec.note = m.subtema;
      rec.amountMinor = toMinor(Math.abs(m.transfer.amount), m.currency);
    } else {
      rec.accountId = resolveAccountId(m.account, m.id);
      if (subtemaId) rec.subtemaId = subtemaId;
    }

    if (m.flags?.length) {
      for (const f of m.flags) {
        issues.push({
          importId,
          kind: 'flag',
          movementLegacyId: m.id,
          detail: f,
        });
      }
    }
    movements.push(rec);
  }

  const budgets: Budget[] = json.budgets.map(b => {
    const st = subtemaByName.get(b.subtema.toUpperCase());
    const subtemaId = st ? st.id : `unknown--${slug(b.subtema)}`;
    if (!st) {
      issues.push({
        importId,
        kind: 'unknown-subtema',
        detail: `Presupuesto ${b.month}: subtema "${b.subtema}" no está en catálogo`,
      });
    }
    return {
      id: budgetId(b.month, subtemaId),
      month: b.month,
      subtemaId,
      previstoMinor: toMinor(b.previsto, 'COP'),
      currency: 'COP',
    };
  });

  const record: ImportRecord = {
    id: importId,
    source: json.meta.source,
    importedAt: now,
    counts: {
      movements: movements.length,
      budgets: budgets.length,
      accounts: accounts.length,
      subtemas: subtemas.length,
      temas: temas.length,
    },
    meta: json.meta,
  };

  await db.transaction(
    'rw',
    [db.accounts, db.temas, db.subtemas, db.movements, db.budgets, db.imports, db.importIssues],
    async () => {
      await db.accounts.bulkPut(accounts);
      await db.temas.bulkPut(temas);
      await db.subtemas.bulkPut(subtemas);
      await db.movements.bulkPut(movements);
      await db.budgets.bulkPut(budgets);
      await db.imports.add(record);
      if (issues.length) await db.importIssues.bulkAdd(issues);
    },
  );

  return { importId, counts: record.counts, issues: issues.length };
}

export async function hasAnyData(): Promise<boolean> {
  const [m, i] = await Promise.all([db.movements.count(), db.imports.count()]);
  return m > 0 || i > 0;
}
