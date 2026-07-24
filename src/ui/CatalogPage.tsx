import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/db/schema';
import {
  createSubtema,
  createTema,
  deleteSubtema,
  deleteTema,
  renameTema,
  setTemaKind,
  subtemaUsage,
  temaUsage,
  updateSubtema,
} from '@/domain/catalog';
import type { Subtema, Tema, TemaKind } from '@/db/types';

export default function CatalogPage() {
  const temas = useLiveQuery(() => db.temas.orderBy('name').toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.orderBy('name').toArray(), []);
  const [newTema, setNewTema] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!temas || !subtemas) return <section className="p-4">Cargando…</section>;

  async function onAddTema() {
    try {
      await createTema(newTema);
      setNewTema('');
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const subsByTema = new Map<string, Subtema[]>();
  for (const s of subtemas) {
    if (!subsByTema.has(s.temaId)) subsByTema.set(s.temaId, []);
    subsByTema.get(s.temaId)!.push(s);
  }

  return (
    <section className="p-4 space-y-4 pb-8">
      <header className="space-y-1">
        <Link to="/datos" className="text-xs text-[var(--color-accent)]">← Datos</Link>
        <h2 className="text-lg font-semibold">Catálogo</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Los cambios al nombre no rompen movimientos ni presupuestos existentes.
        </p>
      </header>

      <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">Nuevo tema</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTema}
            onChange={e => setNewTema(e.target.value)}
            placeholder="Ej: Mascotas"
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={onAddTema}
            disabled={!newTema.trim()}
            className="px-3 py-2 rounded text-sm bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
          >
            Añadir
          </button>
        </div>
        {err && <p className="text-xs text-[var(--color-negative)]">{err}</p>}
      </div>

      <ul className="space-y-3">
        {temas.map(t => (
          <TemaCard
            key={t.id}
            tema={t}
            temas={temas}
            subtemas={subsByTema.get(t.id) ?? []}
          />
        ))}
      </ul>
    </section>
  );
}

function TemaCard({
  tema,
  temas,
  subtemas,
}: {
  tema: Tema;
  temas: Tema[];
  subtemas: Subtema[];
}) {
  const [name, setName] = useState(tema.name);
  const [newSub, setNewSub] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function saveName() {
    if (name.trim() && name !== tema.name) {
      try {
        await renameTema(tema.id, name);
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
        setName(tema.name);
      }
    } else {
      setName(tema.name);
    }
  }

  async function onAddSub() {
    if (!newSub.trim()) return;
    try {
      await createSubtema(newSub, tema.id);
      setNewSub('');
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onDeleteTema() {
    const count = await temaUsage(tema.id);
    if (count > 0) {
      setErr(`Tiene ${count} subtemas; muévelos o elimínalos primero`);
      return;
    }
    if (!confirm(`Eliminar tema "${tema.name}"?`)) return;
    try {
      await deleteTema(tema.id);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <li className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="flex-1 bg-transparent border-b border-transparent focus:border-[var(--color-accent)] outline-none font-medium py-1"
        />
        <KindToggle tema={tema} />
        <span className="text-xs text-[var(--color-text-dim)]">
          {subtemas.length} subtema{subtemas.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onDeleteTema}
          className="text-[var(--color-text-dim)] px-1"
          aria-label="Eliminar tema"
        >
          🗑
        </button>
      </header>

      <ul>
        {subtemas
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
          .map(s => (
            <SubtemaRow key={s.id} subtema={s} temas={temas} />
          ))}
        <li className="p-2 flex gap-2 border-t border-[var(--color-border)]">
          <input
            type="text"
            value={newSub}
            onChange={e => setNewSub(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddSub()}
            placeholder="+ Nuevo subtema"
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={onAddSub}
            disabled={!newSub.trim()}
            className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] disabled:opacity-40"
          >
            Añadir
          </button>
        </li>
      </ul>

      {err && <p className="text-xs text-[var(--color-negative)] px-3 pb-2">{err}</p>}
    </li>
  );
}

function KindToggle({ tema }: { tema: Tema }) {
  const current: TemaKind = tema.kind ?? 'gasto';
  async function toggle() {
    await setTemaKind(tema.id, current === 'ingreso' ? 'gasto' : 'ingreso');
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${
        current === 'ingreso'
          ? 'border-[var(--color-positive)] text-[var(--color-positive)]'
          : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}
      title="Alternar tipo de tema"
    >
      {current === 'ingreso' ? 'Ingreso' : 'Gasto'}
    </button>
  );
}

function SubtemaRow({ subtema, temas }: { subtema: Subtema; temas: Tema[] }) {
  const [name, setName] = useState(subtema.name);
  const [err, setErr] = useState<string | null>(null);
  const usage = useLiveQuery(() => subtemaUsage(subtema.id), [subtema.id]);

  async function saveName() {
    if (name.trim() && name !== subtema.name) {
      try {
        await updateSubtema(subtema.id, { name });
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
        setName(subtema.name);
      }
    } else {
      setName(subtema.name);
    }
  }

  async function onMove(temaId: string) {
    if (temaId === subtema.temaId) return;
    try {
      await updateSubtema(subtema.id, { temaId });
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onDelete() {
    try {
      await deleteSubtema(subtema.id);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const totalUsage = (usage?.movements ?? 0) + (usage?.budgets ?? 0);

  return (
    <li className="px-3 py-2 flex items-center gap-2 border-t border-[var(--color-border)] text-sm">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 bg-transparent border-b border-transparent focus:border-[var(--color-accent)] outline-none py-0.5"
      />
      <select
        value={subtema.temaId}
        onChange={e => onMove(e.target.value)}
        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1 py-0.5 text-xs max-w-[8rem]"
      >
        {temas.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <span className="text-xs text-[var(--color-text-dim)] w-14 text-right tabular-nums">
        {usage ? `${usage.movements}/${usage.budgets}` : '—'}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={totalUsage > 0}
        className="text-[var(--color-text-dim)] disabled:opacity-30"
        aria-label="Eliminar subtema"
      >
        🗑
      </button>
      {err && <span className="basis-full text-xs text-[var(--color-negative)]">{err}</span>}
    </li>
  );
}
