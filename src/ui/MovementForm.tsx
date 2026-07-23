import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/schema';
import { formatMoney, fromMinor, toMinor } from '@/db/money';
import type { Currency, Movement } from '@/db/types';
import type { NewMovementInput } from '@/domain/movements';
import { findAutofillSource, rankDescriptions } from '@/domain/suggestions';
import { PickerGrid } from './components/PickerGrid';
import { TextField } from './components/TextField';
import { SegKind, type QuickKind } from './components/SegKind';

const today = () => new Date().toISOString().slice(0, 10);

export interface MovementFormProps {
  initial?: Movement;
  onSubmit: (input: NewMovementInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  keepStickyOnRepeat?: boolean;
}

interface FormState {
  kind: QuickKind;
  amount: string;
  toAmount: string;
  temaId: string | null;
  subtemaId: string | null;
  accountId: string | null;
  fromId: string | null;
  toId: string | null;
  date: string;
  description: string;
  note: string;
}

function initFromMovement(m: Movement | undefined, subtemaToTema: Map<string, string>): FormState {
  if (!m || (m.kind !== 'gasto' && m.kind !== 'ingreso' && m.kind !== 'transferencia')) {
    return {
      kind: 'gasto', amount: '', toAmount: '', temaId: null, subtemaId: null,
      accountId: null, fromId: null, toId: null,
      date: today(), description: '', note: '',
    };
  }
  const amountAbs = Math.abs(fromMinor(m.amountMinor, m.currency));
  const toAmountAbs =
    m.toAmountMinor != null && m.toCurrency != null
      ? Math.abs(fromMinor(m.toAmountMinor, m.toCurrency))
      : 0;
  return {
    kind: m.kind,
    amount: amountAbs === 0 ? '' : String(amountAbs),
    toAmount: toAmountAbs === 0 ? '' : String(toAmountAbs),
    temaId: m.subtemaId ? subtemaToTema.get(m.subtemaId) ?? null : null,
    subtemaId: m.subtemaId ?? null,
    accountId: m.accountId ?? null,
    fromId: m.fromAccountId ?? null,
    toId: m.toAccountId ?? null,
    date: m.date,
    description: m.description,
    note: m.note ?? '',
  };
}

export function MovementForm({
  initial,
  onSubmit,
  onDelete,
  onCancel,
  submitLabel = 'Guardar',
  keepStickyOnRepeat = false,
}: MovementFormProps) {
  const accounts = useLiveQuery(() => db.accounts.filter(a => !a.archived).toArray(), []);
  const temas = useLiveQuery(() => db.temas.orderBy('name').toArray(), []);
  const subtemas = useLiveQuery(() => db.subtemas.orderBy('name').toArray(), []);
  const recentMovements = useLiveQuery(
    () => db.movements.orderBy('date').reverse().limit(600).toArray(),
    [],
  );
  const descriptionHistory = useMemo(
    () => (recentMovements ?? []).map(r => ({ text: r.description, date: r.date })),
    [recentMovements],
  );

  const subtemaToTema = useMemo(
    () => new Map((subtemas ?? []).map(s => [s.id, s.temaId])),
    [subtemas],
  );

  const [state, setState] = useState<FormState>(() => initFromMovement(initial, subtemaToTema));
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (initial && subtemas) {
      setState(initFromMovement(initial, subtemaToTema));
    }
  }, [initial?.id, subtemas]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEdit = !!initial;
  const fromAccount = accounts?.find(a => a.id === state.fromId);
  const toAccount = accounts?.find(a => a.id === state.toId);
  const activeAccount = accounts?.find(a => a.id === state.accountId);
  const currency: Currency =
    state.kind === 'transferencia'
      ? fromAccount?.currency ?? initial?.currency ?? 'COP'
      : activeAccount?.currency ?? initial?.currency ?? 'COP';
  const toCurrency: Currency = toAccount?.currency ?? currency;
  const isBimonetary = state.kind === 'transferencia' && !!fromAccount && !!toAccount && fromAccount.currency !== toAccount.currency;

  const filteredSubtemas = useMemo(
    () => (state.temaId ? (subtemas ?? []).filter(s => s.temaId === state.temaId) : []),
    [subtemas, state.temaId],
  );

  const suggestions = useMemo(
    () => rankDescriptions(descriptionHistory ?? [], state.description, 6),
    [descriptionHistory, state.description],
  );
  const showSuggestions =
    suggestions.length > 0 &&
    suggestions.some(s => s !== state.description.trim());

  const amountNumber = parseFloat(state.amount.replace(',', '.'));
  const amountValid = !isNaN(amountNumber) && amountNumber > 0;
  const toAmountNumber = parseFloat(state.toAmount.replace(',', '.'));
  const toAmountValid = !isNaN(toAmountNumber) && toAmountNumber > 0;

  const canSave =
    amountValid &&
    !!state.description.trim() &&
    (state.kind === 'transferencia'
      ? !!state.fromId && !!state.toId && state.fromId !== state.toId && (!isBimonetary || toAmountValid)
      : !!state.accountId && !!state.subtemaId);

  function patch(p: Partial<FormState>) {
    setState(s => ({ ...s, ...p }));
  }

  function applySuggestion(text: string) {
    const next: Partial<FormState> = { description: text };
    if (state.kind !== 'transferencia') {
      const src = findAutofillSource(recentMovements ?? [], text, state.kind);
      if (src) {
        if (state.subtemaId == null && src.subtemaId) {
          next.subtemaId = src.subtemaId;
          if (state.temaId == null) {
            next.temaId = subtemaToTema.get(src.subtemaId) ?? null;
          }
        }
        if (state.accountId == null && src.accountId) {
          next.accountId = src.accountId;
        }
      }
    }
    setState(s => ({ ...s, ...next }));
  }

  function partialReset() {
    setState(s => ({ ...s, amount: '', toAmount: '', subtemaId: null, description: '', note: '' }));
  }

  async function handleSubmit() {
    if (!canSave) return;
    setBusy(true);
    try {
      const input: NewMovementInput =
        state.kind === 'transferencia'
          ? {
              kind: 'transferencia',
              date: state.date,
              description: state.description,
              amount: amountNumber,
              currency,
              fromAccountId: state.fromId!,
              toAccountId: state.toId!,
              toAmount: isBimonetary ? toAmountNumber : undefined,
              toCurrency: isBimonetary ? toCurrency : undefined,
              note: state.note,
            }
          : {
              kind: state.kind,
              date: state.date,
              description: state.description,
              amount: amountNumber,
              currency,
              accountId: state.accountId!,
              subtemaId: state.subtemaId!,
            };
      await onSubmit(input);
      if (!isEdit) {
        const signed = toMinor(amountNumber, currency) * (state.kind === 'gasto' ? -1 : 1);
        setFlash(`Guardado ${formatMoney(signed, currency)}`);
        if (keepStickyOnRepeat) partialReset();
        setTimeout(() => setFlash(null), 1600);
      }
    } catch (e) {
      setFlash(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  if (!accounts || !temas || !subtemas) return <div className="p-4">Cargando…</div>;
  if (accounts.length === 0)
    return (
      <div className="p-4 text-sm text-[var(--color-text-dim)]">
        No hay cuentas. Importa datos o crea cuentas primero.
      </div>
    );

  return (
    <div className="space-y-5">
      <SegKind
        value={state.kind}
        onChange={k => patch({ kind: k, subtemaId: null })}
        disabled={isEdit}
      />

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Monto ({currency})
        </label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus={!isEdit}
          placeholder="0"
          value={state.amount}
          onChange={e => patch({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
          className="w-full text-4xl font-semibold tabular-nums bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-2"
        />
      </div>

      {state.kind !== 'transferencia' ? (
        <>
          <PickerGrid
            label="Tema"
            options={temas.map(t => ({ id: t.id, name: t.name }))}
            selectedId={state.temaId}
            onSelect={id => patch({ temaId: id, subtemaId: null })}
          />
          {state.temaId && (
            <PickerGrid
              label="Subtema"
              options={filteredSubtemas.map(s => ({ id: s.id, name: s.name }))}
              selectedId={state.subtemaId}
              onSelect={id => patch({ subtemaId: id })}
              empty="Este tema no tiene subtemas."
            />
          )}
          <PickerGrid
            label="Cuenta"
            options={accounts.map(a => ({ id: a.id, name: `${a.name} · ${a.currency}` }))}
            selectedId={state.accountId}
            onSelect={id => patch({ accountId: id })}
          />
        </>
      ) : (
        <>
          <PickerGrid
            label="Desde"
            options={accounts.map(a => ({ id: a.id, name: `${a.name} · ${a.currency}` }))}
            selectedId={state.fromId}
            onSelect={id => patch({ fromId: id, toId: state.toId === id ? null : state.toId })}
          />
          <PickerGrid
            label="Hacia"
            options={accounts
              .filter(a => a.id !== state.fromId)
              .map(a => ({ id: a.id, name: `${a.name} · ${a.currency}` }))}
            selectedId={state.toId}
            onSelect={id => patch({ toId: id })}
            empty="Elige la cuenta de origen primero."
          />
          {isBimonetary && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                Monto recibido ({toCurrency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={state.toAmount}
                onChange={e => patch({ toAmount: e.target.value.replace(/[^\d.,]/g, '') })}
                className="w-full text-3xl font-semibold tabular-nums bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-2"
              />
              {amountValid && toAmountValid && (
                <p className="text-xs text-[var(--color-text-dim)]">
                  Tasa: 1 {currency} ={' '}
                  <span className="tabular-nums">
                    {(toAmountNumber / amountNumber).toLocaleString('es-CO', {
                      maximumFractionDigits: 6,
                    })}
                  </span>{' '}
                  {toCurrency}
                </p>
              )}
            </div>
          )}
          <TextField label="Nota (opcional)" value={state.note} onChange={v => patch({ note: v })} placeholder="Retiro, abono…" />
        </>
      )}

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Descripción
        </label>
        <input
          type="text"
          value={state.description}
          onChange={e => patch({ description: e.target.value })}
          placeholder="Ej: Almuerzo con Ana"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-base"
        />
        {showSuggestions && (
          <div className="flex gap-2 overflow-x-auto pt-1 -mx-1 px-1">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => applySuggestion(s)}
                className="shrink-0 px-3 py-1 rounded-full text-xs border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-dim)] whitespace-nowrap"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">Fecha</label>
        <input
          type="date"
          value={state.date}
          onChange={e => patch({ date: e.target.value })}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-2 text-sm"
        />
      </div>

      {flash && (
        <div className="rounded bg-[var(--color-surface-2)] border border-[var(--color-accent)] px-3 py-2 text-sm">
          {flash}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSave || busy}
          className="w-full py-4 rounded-lg bg-[var(--color-accent)] text-slate-900 font-medium disabled:opacity-40"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 rounded-lg border border-[var(--color-border)] text-sm"
          >
            Cancelar
          </button>
        )}
        {onDelete && (
          <div className="pt-2 border-t border-[var(--color-border)]">
            {!confirmDel ? (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="w-full py-3 rounded-lg border border-[var(--color-negative)] text-[var(--color-negative)] text-sm"
              >
                Eliminar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  className="flex-1 py-3 rounded-lg border border-[var(--color-border)] text-sm"
                >
                  No, cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 py-3 rounded-lg bg-[var(--color-negative)] text-slate-900 font-medium text-sm"
                >
                  Sí, eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
