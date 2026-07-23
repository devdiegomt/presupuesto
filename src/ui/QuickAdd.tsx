import { MovementForm } from './MovementForm';
import { createMovement } from '@/domain/movements';

export default function QuickAdd() {
  return (
    <section className="p-4 pb-8">
      <MovementForm
        onSubmit={async input => {
          await createMovement(input);
        }}
        keepStickyOnRepeat
      />
    </section>
  );
}
