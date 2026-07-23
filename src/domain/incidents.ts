import { db } from '@/db/schema';
import type { ImportIssue, ImportIssueKind, Movement } from '@/db/types';

export async function dismissIssue(id: number): Promise<void> {
  await db.importIssues.delete(id);
}

export async function dismissByKind(kind: ImportIssueKind): Promise<number> {
  return db.importIssues.where('kind').equals(kind).delete();
}

export async function dismissAll(): Promise<number> {
  const n = await db.importIssues.count();
  await db.importIssues.clear();
  return n;
}

export function extractQuoted(detail: string): string | undefined {
  const m = detail.match(/"([^"]+)"/);
  return m ? m[1] : undefined;
}

export interface IssueGroup {
  rawName: string;
  issues: ImportIssue[];
  withMovement: number;
  budgetOnly: number;
}

function groupIssuesByRawName(issues: ImportIssue[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>();
  for (const i of issues) {
    const raw = extractQuoted(i.detail);
    if (!raw) continue;
    let g = map.get(raw);
    if (!g) {
      g = { rawName: raw, issues: [], withMovement: 0, budgetOnly: 0 };
      map.set(raw, g);
    }
    g.issues.push(i);
    if (i.movementLegacyId != null) g.withMovement += 1;
    else g.budgetOnly += 1;
  }
  return [...map.values()].sort((a, b) => b.issues.length - a.issues.length);
}

export function groupUnknownSubtemaIssues(issues: ImportIssue[]): IssueGroup[] {
  return groupIssuesByRawName(issues.filter(i => i.kind === 'unknown-subtema'));
}

export function groupMissingAccountIssues(issues: ImportIssue[]): IssueGroup[] {
  return groupIssuesByRawName(issues.filter(i => i.kind === 'account-missing'));
}

export interface BulkResult {
  movementsUpdated: number;
  issuesDismissed: number;
  skipped: number;
}

export async function bulkAssignSubtema(
  rawName: string,
  targetSubtemaId: string,
): Promise<BulkResult> {
  const target = await db.subtemas.get(targetSubtemaId);
  if (!target) throw new Error(`Subtema ${targetSubtemaId} no existe`);

  const [issues, movements] = await Promise.all([
    db.importIssues.where('kind').equals('unknown-subtema').toArray(),
    db.movements.toArray(),
  ]);

  const matching = issues.filter(i => extractQuoted(i.detail) === rawName);
  const byLegacy = new Map<number, Movement>();
  for (const m of movements) if (m.legacyId != null) byLegacy.set(m.legacyId, m);

  let updated = 0;
  let dismissed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  await db.transaction('rw', [db.movements, db.importIssues], async () => {
    for (const iss of matching) {
      if (iss.movementLegacyId != null) {
        const mov = byLegacy.get(iss.movementLegacyId);
        if (mov && !mov.subtemaId && (mov.kind === 'gasto' || mov.kind === 'ingreso')) {
          await db.movements.put({ ...mov, subtemaId: targetSubtemaId, updatedAt: now });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        skipped += 1;
      }
      if (iss.id != null) await db.importIssues.delete(iss.id);
      dismissed += 1;
    }
  });

  return { movementsUpdated: updated, issuesDismissed: dismissed, skipped };
}

export async function bulkAssignAccount(
  rawName: string,
  targetAccountId: string,
): Promise<BulkResult> {
  const target = await db.accounts.get(targetAccountId);
  if (!target) throw new Error(`Cuenta ${targetAccountId} no existe`);

  const [issues, movements] = await Promise.all([
    db.importIssues.where('kind').equals('account-missing').toArray(),
    db.movements.toArray(),
  ]);

  const matching = issues.filter(i => extractQuoted(i.detail) === rawName);
  const byLegacy = new Map<number, Movement>();
  for (const m of movements) if (m.legacyId != null) byLegacy.set(m.legacyId, m);

  let updated = 0;
  let dismissed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  await db.transaction('rw', [db.movements, db.importIssues], async () => {
    for (const iss of matching) {
      let didUpdate = false;
      if (iss.movementLegacyId != null) {
        const mov = byLegacy.get(iss.movementLegacyId);
        if (mov && mov.currency === target.currency) {
          const next: Movement = { ...mov, updatedAt: now };
          if (mov.kind === 'transferencia') {
            if (!mov.fromAccountId && mov.toAccountId) {
              next.fromAccountId = targetAccountId;
              didUpdate = true;
            } else if (!mov.toAccountId && mov.fromAccountId) {
              next.toAccountId = targetAccountId;
              didUpdate = true;
            }
          } else if ((mov.kind === 'gasto' || mov.kind === 'ingreso') && !mov.accountId) {
            next.accountId = targetAccountId;
            didUpdate = true;
          }
          if (didUpdate) {
            await db.movements.put(next);
            updated += 1;
          }
        }
      }
      if (!didUpdate) skipped += 1;
      if (iss.id != null) await db.importIssues.delete(iss.id);
      dismissed += 1;
    }
  });

  return { movementsUpdated: updated, issuesDismissed: dismissed, skipped };
}
