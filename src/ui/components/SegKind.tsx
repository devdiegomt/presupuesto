export type QuickKind = 'gasto' | 'ingreso' | 'transferencia';

const OPTS: Array<{ id: QuickKind; label: string }> = [
  { id: 'gasto', label: 'Gasto' },
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'transferencia', label: 'Transferir' },
];

export function SegKind({
  value,
  onChange,
  disabled,
}: {
  value: QuickKind;
  onChange: (k: QuickKind) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-1 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {OPTS.map(o => (
        <button
          key={o.id}
          type="button"
          disabled={disabled && value !== o.id}
          onClick={() => !disabled && onChange(o.id)}
          className={`py-2 text-sm rounded ${
            value === o.id
              ? 'bg-[var(--color-accent)] text-slate-900 font-medium'
              : 'text-[var(--color-text-dim)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
