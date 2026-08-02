import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import { importSeed } from '@/import/seed';
import { downloadBlob, exportAll } from '@/import/export';
import { resetAllSyncCursors } from '@/lib/sync';
import SyncPanel from './SyncPanel';

export default function DataPanel() {
  const imports = useLiveQuery(() => db.imports.orderBy('importedAt').reverse().toArray(), []);
  const issuesCount = useLiveQuery(() => db.importIssues.count(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onImport(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importSeed(json);
      setMsg(
        `Importados ${res.counts.movements} movimientos, ${res.counts.budgets} presupuestos, ${res.counts.accounts} cuentas. Incidencias: ${res.issues}.`,
      );
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    const blob = await exportAll();
    downloadBlob(blob, `presupuesto-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function onReset() {
    if (
      !confirm(
        'Vacía la base de ESTE dispositivo. No borra nada del servidor: si tenés ' +
          'sesión iniciada, el próximo sync vuelve a bajar todo. ¿Continuar?',
      )
    ) {
      return;
    }
    setBusy(true);
    await db.transaction(
      'rw',
      [
        db.accounts,
        db.temas,
        db.subtemas,
        db.movements,
        db.budgets,
        db.reconciliations,
        db.monthClosures,
        db.imports,
        db.importIssues,
        db.syncTombstones,
      ],
      async () => {
        await Promise.all([
          db.accounts.clear(),
          db.temas.clear(),
          db.subtemas.clear(),
          db.movements.clear(),
          db.budgets.clear(),
          db.reconciliations.clear(),
          db.monthClosures.clear(),
          db.imports.clear(),
          db.importIssues.clear(),
          // La cola de borrados también se va: son deletes de datos que ya no
          // existen acá, y mandarlos al servidor borraría las filas buenas.
          db.syncTombstones.clear(),
        ]);
      },
    );
    // Sin esto, el próximo pull creería que ya bajó todo y dejaría la base vacía.
    resetAllSyncCursors();
    setBusy(false);
    setMsg('Base local vaciada. Sincronizá para volver a bajar desde el servidor.');
  }

  return (
    <section className="p-4 space-y-6">
      <SyncPanel />

      <div>
        <h2 className="text-base font-medium mb-2">Catálogo</h2>
        <Link
          to="/catalogo"
          className="inline-block px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          Editar temas y subtemas
        </Link>
      </div>

      <div>
        <h2 className="text-base font-medium mb-2">Importar semilla JSON</h2>
        <label className="inline-block px-3 py-2 rounded bg-[var(--color-accent)] text-slate-900 text-sm font-medium cursor-pointer">
          Elegir archivo…
          <input
            type="file"
            accept="application/json"
            className="hidden"
            disabled={busy}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </label>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </div>

      <div>
        <h2 className="text-base font-medium mb-2">Exportar</h2>
        <button
          onClick={onExport}
          className="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          Descargar JSON completo
        </button>
      </div>

      <div>
        <h2 className="text-base font-medium mb-2">Historial de importaciones</h2>
        {imports?.length ? (
          <ul className="space-y-1 text-sm">
            {imports.map(i => (
              <li key={i.id} className="text-[var(--color-text-dim)]">
                {i.importedAt.slice(0, 19).replace('T', ' ')} · {i.source} ·{' '}
                {i.counts.movements} mov
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-text-dim)]">Aún no hay importaciones.</p>
        )}
        {issuesCount ? (
          <Link
            to="/incidencias"
            className="mt-2 inline-block text-xs text-[var(--color-warn)] underline"
          >
            {issuesCount} incidencias registradas · revisar
          </Link>
        ) : null}
      </div>

      <div>
        <h2 className="text-base font-medium mb-2 text-[var(--color-negative)]">Zona peligrosa</h2>
        <button
          onClick={onReset}
          disabled={busy}
          className="px-3 py-2 rounded border border-[var(--color-negative)] text-[var(--color-negative)] text-sm"
        >
          Vaciar base local
        </button>
      </div>
    </section>
  );
}
