import { db } from '@/db/schema';

export async function exportAll(): Promise<Blob> {
  const [accounts, temas, subtemas, movements, budgets, reconciliations, imports] =
    await Promise.all([
      db.accounts.toArray(),
      db.temas.toArray(),
      db.subtemas.toArray(),
      db.movements.toArray(),
      db.budgets.toArray(),
      db.reconciliations.toArray(),
      db.imports.toArray(),
    ]);

  const payload = {
    schema: 'presupuesto/1',
    exportedAt: new Date().toISOString(),
    accounts,
    temas,
    subtemas,
    movements,
    budgets,
    reconciliations,
    imports,
  };

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
