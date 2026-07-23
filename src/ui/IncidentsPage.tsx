import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import {
  bulkAssignAccount,
  bulkAssignSubtema,
  dismissAll,
  dismissByKind,
  dismissIssue,
  groupMissingAccountIssues,
  groupUnknownSubtemaIssues,
  type IssueGroup,
} from '@/domain/incidents';
import type { Account, ImportIssueKind, Movement, Subtema, Tema } from '@/db/types';
import { MovementEditModal } from './MovementEditModal';

const KIND_LABEL: Record<ImportIssueKind, string> = {
  'unknown-subtema': 'Subtema desconocido',
  'tema-mismatch': 'Tema no coincide',
  'account-missing': 'Cuenta faltante',
  'flag': 'Marca del importador',
  'other': 'Otra',
};

const KIND_ORDER: ImportIssueKind[] = [
  'unknown-subtema',
  'account-missing',
  'flag',
  'tema-mismatch',
  'other',
];

const PAGE_SIZE = 100;

export default function IncidentsPage() {
  const issues = useLiveQuery(() => db.importIssues.toArray(), []);
  const movementsByLegacy = useLiveQuery(async () => {
    const all = await db.movements.toArray();
    const map = new Map<number, Movement>();
    for (const m of all) if (m.legacyId != null) map.set(m.legacyId, m);
    return map;
  }, []);

  const [filter, setFilter] = useState<'all' | ImportIssueKind>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<Movement | null>(null);

  const countsByKind = useMemo(() => {
    const c = new Map<ImportIssueKind, number>();
    for (const i of issues ?? []) c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
    return c;
  }, [issues]);

  const filtered = useMemo(() => {
    if (!issues) return [];
    return filter === 'all' ? issues : issues.filter(i => i.kind === filter);
  }, [issues, filter]);

  const accounts = useLiveQuery(() => db.accounts.filter(a => !a.archived).toArray(), []);
  const temas = useLiveQuery(() => db.temas.orderBy('name').toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.orderBy('name').toArray(), []);

  const unknownSubtemaGroups = useMemo(
    () => (issues ? groupUnknownSubtemaIssues(issues) : []),
    [issues],
  );
  const missingAccountGroups = useMemo(
    () => (issues ? groupMissingAccountIssues(issues) : []),
    [issues],
  );

  if (!issues || !movementsByLegacy) return <section className="p-4">Cargando…</section>;

  const total = issues.length;

  if (total === 0) {
    return (
      <section className="p-4 space-y-2">
        <Link to="/datos" className="text-xs text-[var(--color-accent)]">← Datos</Link>
        <h2 className="text-lg font-semibold">Incidencias</h2>
        <p className="text-sm text-[var(--color-text-dim)]">Sin incidencias registradas.</p>
      </section>
    );
  }

  async function onDismissKind(kind: ImportIssueKind) {
    const n = countsByKind.get(kind) ?? 0;
    if (!confirm(`Descartar ${n} incidencia${n === 1 ? '' : 's'} de "${KIND_LABEL[kind]}"?`)) return;
    await dismissByKind(kind);
  }

  async function onDismissAll() {
    if (!confirm(`Descartar TODAS las ${total} incidencias?`)) return;
    await dismissAll();
  }

  return (
    <section className="p-4 space-y-4 pb-8">
      <header className="space-y-1">
        <Link to="/datos" className="text-xs text-[var(--color-accent)]">← Datos</Link>
        <h2 className="text-lg font-semibold">Incidencias del import</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          {total} registradas. Son historial; descartar no toca los movimientos.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setFilter('all'); setLimit(PAGE_SIZE); }}
          className={`px-2 py-1 rounded text-xs border ${
            filter === 'all'
              ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
          }`}
        >
          Todas · {total}
        </button>
        {KIND_ORDER.filter(k => (countsByKind.get(k) ?? 0) > 0).map(k => (
          <button
            key={k}
            onClick={() => { setFilter(k); setLimit(PAGE_SIZE); }}
            className={`px-2 py-1 rounded text-xs border ${
              filter === k
                ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
          >
            {KIND_LABEL[k]} · {countsByKind.get(k) ?? 0}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {filter !== 'all' && (
          <button
            type="button"
            onClick={() => onDismissKind(filter)}
            className="px-3 py-1.5 rounded text-xs border border-[var(--color-negative)] text-[var(--color-negative)]"
          >
            Descartar {countsByKind.get(filter)} de "{KIND_LABEL[filter]}"
          </button>
        )}
        <button
          type="button"
          onClick={onDismissAll}
          className="px-3 py-1.5 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-dim)]"
        >
          Descartar todas
        </button>
      </div>

      {filter === 'unknown-subtema' && subtemas && temas && unknownSubtemaGroups.length > 0 && (
        <BulkSubtemaPanel groups={unknownSubtemaGroups} subtemas={subtemas} temas={temas} />
      )}
      {filter === 'account-missing' && accounts && missingAccountGroups.length > 0 && (
        <BulkAccountPanel groups={missingAccountGroups} accounts={accounts} />
      )}

      <ul className="divide-y divide-[var(--color-border)]">
        {filtered.slice(0, limit).map(i => {
          const mov = i.movementLegacyId != null ? movementsByLegacy.get(i.movementLegacyId) : undefined;
          return (
            <li key={i.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                  {KIND_LABEL[i.kind]}
                </p>
                <p className="text-sm break-words">{i.detail}</p>
                {mov && (
                  <button
                    type="button"
                    onClick={() => setEditing(mov)}
                    className="mt-1 text-xs text-[var(--color-accent)] underline"
                  >
                    Abrir mov · {mov.date} · {mov.description || '(sin descripción)'}
                  </button>
                )}
                {!mov && i.movementLegacyId != null && (
                  <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                    Movimiento legacy #{i.movementLegacyId} no encontrado
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => i.id != null && dismissIssue(i.id)}
                className="text-[var(--color-text-dim)] p-1 shrink-0"
                aria-label="Descartar"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {filtered.length > limit && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setLimit(l => l + PAGE_SIZE)}
            className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            Cargar {Math.min(PAGE_SIZE, filtered.length - limit)} más
          </button>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            {limit} de {filtered.length}
          </p>
        </div>
      )}

      <MovementEditModal movement={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function BulkSubtemaPanel({
  groups,
  subtemas,
  temas,
}: {
  groups: IssueGroup[];
  subtemas: Subtema[];
  temas: Tema[];
}) {
  const temaById = new Map(temas.map(t => [t.id, t.name]));
  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-3">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        Reasignar en bulk · agrupado por nombre original
      </p>
      <ul className="space-y-2">
        {groups.map(g => (
          <BulkSubtemaRow key={g.rawName} group={g} subtemas={subtemas} temaById={temaById} />
        ))}
      </ul>
    </div>
  );
}

function BulkSubtemaRow({
  group,
  subtemas,
  temaById,
}: {
  group: IssueGroup;
  subtemas: Subtema[];
  temaById: Map<string, string>;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function apply() {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await bulkAssignSubtema(group.rawName, target);
      setMsg(`Actualizados ${r.movementsUpdated} · descartadas ${r.issuesDismissed}${r.skipped ? ` · ${r.skipped} sin cambio` : ''}`);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="p-2 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium truncate">"{group.rawName}"</span>
        <span className="text-xs text-[var(--color-text-dim)] whitespace-nowrap">
          {group.withMovement} mov · {group.budgetOnly} pres.
        </span>
      </div>
      <div className="flex gap-2">
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
        >
          <option value="">Elegir subtema…</option>
          {subtemas.map(s => (
            <option key={s.id} value={s.id}>
              {temaById.get(s.temaId) ?? '?'} · {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          disabled={!target || busy}
          className="px-3 py-1.5 rounded text-sm bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
      {msg && <p className="text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </li>
  );
}

function BulkAccountPanel({
  groups,
  accounts,
}: {
  groups: IssueGroup[];
  accounts: Account[];
}) {
  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-3">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        Reasignar cuentas en bulk
      </p>
      <ul className="space-y-2">
        {groups.map(g => (
          <BulkAccountRow key={g.rawName} group={g} accounts={accounts} />
        ))}
      </ul>
    </div>
  );
}

function BulkAccountRow({
  group,
  accounts,
}: {
  group: IssueGroup;
  accounts: Account[];
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function apply() {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await bulkAssignAccount(group.rawName, target);
      setMsg(`Actualizados ${r.movementsUpdated} · descartadas ${r.issuesDismissed}${r.skipped ? ` · ${r.skipped} sin cambio` : ''}`);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="p-2 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium truncate">"{group.rawName}"</span>
        <span className="text-xs text-[var(--color-text-dim)] whitespace-nowrap">
          {group.withMovement} mov
        </span>
      </div>
      <div className="flex gap-2">
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
        >
          <option value="">Elegir cuenta…</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          disabled={!target || busy}
          className="px-3 py-1.5 rounded text-sm bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
      {msg && <p className="text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </li>
  );
}
