import { NavLink, Outlet } from 'react-router-dom';
import { TabIcon, type TabIconName } from './ui/components/TabIcon';
import SyncBanner from './ui/components/SyncBanner';
import { useAutoSync } from './lib/autoSync';

const tabs: Array<{ to: string; label: string; icon: TabIconName; end?: boolean }> = [
  { to: '/', label: 'Hoy', icon: 'home', end: true },
  { to: '/nuevo', label: 'Añadir', icon: 'plus' },
  { to: '/cuentas', label: 'Cuentas', icon: 'wallet' },
  { to: '/mes', label: 'Mes', icon: 'calendar' },
  { to: '/buscar', label: 'Buscar', icon: 'search' },
  { to: '/datos', label: 'Datos', icon: 'gear' },
];

export default function App() {
  // Acá y no en una ruta: el layout está montado siempre, una ruta solo existe
  // mientras se la mira. Ese era justamente el bug — el sync vivía dentro de
  // la pestaña Datos.
  useAutoSync();

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Presupuesto</h1>
        <span className="text-xs text-[var(--color-text-dim)]">local-first</span>
      </header>

      <SyncBanner />

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-6">
          {tabs.map(t => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                    isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
                  }`
                }
              >
                <TabIcon name={t.icon} />
                <span>{t.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
