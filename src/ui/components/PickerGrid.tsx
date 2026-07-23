interface Option {
  id: string;
  name: string;
}

export function PickerGrid({
  label,
  options,
  selectedId,
  onSelect,
  empty,
}: {
  label: string;
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">{label}</label>
      {options.length === 0 ? (
        <p className="text-xs text-[var(--color-text-dim)]">{empty ?? '—'}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className={`px-3 py-2 rounded-full text-sm border ${
                selectedId === o.id
                  ? 'bg-[var(--color-accent)] text-slate-900 border-[var(--color-accent)] font-medium'
                  : 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)]'
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
