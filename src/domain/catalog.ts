import { db } from '@/db/schema';
import { txWithTombstones } from '@/db/hooks';
import { slug } from '@/db/ids';
import type { Subtema, Tema, TemaKind } from '@/db/types';

async function uniqueTemaId(base: string): Promise<string> {
  if (!(await db.temas.get(base))) return base;
  let n = 2;
  while (await db.temas.get(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function uniqueSubtemaId(temaId: string, base: string): Promise<string> {
  const full = `${temaId}--${base}`;
  if (!(await db.subtemas.get(full))) return full;
  let n = 2;
  while (await db.subtemas.get(`${full}-${n}`)) n += 1;
  return `${full}-${n}`;
}

export async function createTema(name: string): Promise<Tema> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre es obligatorio');
  const base = slug(trimmed) || 'tema';
  const id = await uniqueTemaId(base);
  const tema: Tema = { id, name: trimmed, updatedAt: new Date().toISOString() };
  await db.temas.put(tema);
  return tema;
}

export async function renameTema(id: string, name: string): Promise<Tema> {
  const existing = await db.temas.get(id);
  if (!existing) throw new Error(`Tema ${id} no existe`);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre es obligatorio');
  const updated: Tema = { ...existing, name: trimmed };
  await db.temas.put(updated);
  return updated;
}

export async function setTemaKind(id: string, kind: TemaKind): Promise<Tema> {
  const existing = await db.temas.get(id);
  if (!existing) throw new Error(`Tema ${id} no existe`);
  const updated: Tema = { ...existing, kind };
  await db.temas.put(updated);
  return updated;
}

export async function temaUsage(id: string): Promise<number> {
  return db.subtemas.where('temaId').equals(id).count();
}

export async function deleteTema(id: string): Promise<void> {
  const usage = await temaUsage(id);
  if (usage > 0) throw new Error(`Tema con ${usage} subtemas; muévelos o elimínalos primero`);
  await txWithTombstones([db.temas], async () => {
    await db.temas.delete(id);
  });
}

export async function createSubtema(name: string, temaId: string): Promise<Subtema> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre es obligatorio');
  if (!(await db.temas.get(temaId))) throw new Error(`Tema ${temaId} no existe`);
  const base = slug(trimmed) || 'subtema';
  const id = await uniqueSubtemaId(temaId, base);
  const sub: Subtema = {
    id,
    name: trimmed,
    temaId,
    updatedAt: new Date().toISOString(),
  };
  await db.subtemas.put(sub);
  return sub;
}

export async function updateSubtema(
  id: string,
  patch: Partial<Pick<Subtema, 'name' | 'temaId'>>,
): Promise<Subtema> {
  const existing = await db.subtemas.get(id);
  if (!existing) throw new Error(`Subtema ${id} no existe`);
  if (patch.temaId && !(await db.temas.get(patch.temaId))) {
    throw new Error(`Tema ${patch.temaId} no existe`);
  }
  const updated: Subtema = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    temaId: patch.temaId ?? existing.temaId,
  };
  await db.subtemas.put(updated);
  return updated;
}

export interface SubtemaUsage {
  movements: number;
  budgets: number;
}

export async function subtemaUsage(id: string): Promise<SubtemaUsage> {
  const [movements, budgets] = await Promise.all([
    db.movements.where('subtemaId').equals(id).count(),
    db.budgets.where('subtemaId').equals(id).count(),
  ]);
  return { movements, budgets };
}

export async function deleteSubtema(id: string): Promise<void> {
  const usage = await subtemaUsage(id);
  if (usage.movements > 0 || usage.budgets > 0) {
    throw new Error(
      `Subtema en uso: ${usage.movements} movimientos, ${usage.budgets} presupuestos`,
    );
  }
  await txWithTombstones([db.subtemas], async () => {
    await db.subtemas.delete(id);
  });
}
