import { useEffect } from 'react';
import type { Movement } from '@/db/types';
import { deleteMovement, updateMovement } from '@/domain/movements';
import { formatMoney } from '@/db/money';
import { MovementForm } from './MovementForm';

export function MovementEditModal({
  movement,
  onClose,
}: {
  movement: Movement | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!movement) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [movement, onClose]);

  if (!movement) return null;

  const editable =
    movement.kind === 'gasto' || movement.kind === 'ingreso' || movement.kind === 'transferencia';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-[var(--color-bg)] rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium">
            {editable ? 'Editar movimiento' : 'Movimiento (ajuste)'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-dim)] w-8 h-8 flex items-center justify-center"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        {editable ? (
          <MovementForm
            initial={movement}
            submitLabel="Actualizar"
            onSubmit={async input => {
              await updateMovement(movement.id, input);
              onClose();
            }}
            onCancel={onClose}
            onDelete={async () => {
              await deleteMovement(movement.id);
              onClose();
            }}
          />
        ) : (
          <AjusteView movement={movement} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function AjusteView({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <Row label="Fecha" value={movement.date} />
        <Row label="Descripción" value={movement.description || '—'} />
        <Row
          label="Delta"
          value={formatMoney(movement.amountMinor, movement.currency)}
          mono
        />
        {movement.reconciliationId && (
          <Row label="Reconciliación" value={movement.reconciliationId} mono />
        )}
      </dl>
      <p className="text-xs text-[var(--color-text-dim)]">
        Los ajustes se crean desde el flujo de reconciliación. No son editables aquí;
        elimínalo si quieres rehacer el desface.
      </p>
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={async () => {
            if (!confirm('Eliminar este ajuste y su reconciliación asociada?')) return;
            await deleteMovement(movement.id);
            onClose();
          }}
          className="w-full py-3 rounded-lg border border-[var(--color-negative)] text-[var(--color-negative)] text-sm"
        >
          Eliminar ajuste
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-lg border border-[var(--color-border)] text-sm"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-text-dim)]">{label}</dt>
      <dd className={mono ? 'tabular-nums' : ''}>{value}</dd>
    </div>
  );
}
