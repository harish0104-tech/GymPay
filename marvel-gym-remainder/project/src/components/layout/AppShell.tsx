import { useEffect, useState, type ReactNode } from 'react';
import { Home, Users, CreditCard, Bell, Settings, Plus, LayoutGrid, X, Menu } from 'lucide-react';

export type PageKey = 'dashboard' | 'members' | 'plans' | 'payments' | 'reminders' | 'settings';

interface AppShellProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  onAddMember: () => void;
  children: ReactNode;
}

const navItems: { key: PageKey; label: string; icon: typeof Home }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Home },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'plans', label: 'Plans', icon: LayoutGrid },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const mobilePrimaryItems = [
  { key: 'dashboard' as PageKey, label: 'Home', icon: Home },
  { key: 'members' as PageKey, label: 'Members', icon: Users },
];

const mobileMoreItems = [
  { key: 'plans' as PageKey, label: 'Plans', icon: LayoutGrid },
  { key: 'payments' as PageKey, label: 'Payments', icon: CreditCard },
  { key: 'settings' as PageKey, label: 'Settings', icon: Settings },
];

export default function AppShell({ currentPage, onNavigate, onAddMember, children }: AppShellProps) {
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  useEffect(() => {
    const openMobileMenu = () => setShowMobileDrawer(true);
    window.addEventListener('mfc:open-mobile-menu', openMobileMenu);
    return () => window.removeEventListener('mfc:open-mobile-menu', openMobileMenu);
  }, []);

  const navigateMobile = (page: PageKey) => {
    setShowMobileMore(false);
    setShowMobileDrawer(false);
    onNavigate(page);
  };

  return (
    <div className="theme-shell minimal-theme min-h-screen flex" data-theme="light">
      {/* Desktop sidebar */}
      <aside className="sidebar-texture fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-[#242524] bg-brand-pure md:flex">
        <div className="flex min-h-24 items-center justify-center border-b border-ink-800 px-5 py-3">
          <img src="/gym-pay-logo.svg" alt="Gym Pay" className="h-14 w-36 object-contain" />
        </div>

        <nav className="flex-1 space-y-1.5 px-4 py-3">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 font-heading text-[15px] font-semibold tracking-wide transition-all ${
                  active ? 'bg-brand-yellow text-brand-pure shadow-lg shadow-brand-yellow/10' : 'text-ink-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-[22px] w-[22px] shrink-0 transition-transform group-hover:scale-105" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-ink-800 p-4">
          <p className="px-3 text-sm text-ink-300">Frontend demo · Local data</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-[224px]">
        <main className="app-content min-w-0 flex-1 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {showMobileDrawer && (
        <div className="mobile-drawer-backdrop md:hidden fixed inset-0 z-40 bg-black/65" onClick={() => setShowMobileDrawer(false)}>
          <aside
            className="sidebar-texture mobile-drawer-panel h-full w-[74%] max-w-[260px] border-r border-[#242524] bg-black p-5 text-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="relative mb-7 flex min-h-20 items-center justify-center border-b border-white/10 pb-5">
              <img src="/gym-pay-logo.svg" alt="Gym Pay" className="h-16 w-36 object-contain" />
              <button type="button" onClick={() => setShowMobileDrawer(false)} className="absolute right-0 top-2 p-2 text-ink-300" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1.5">
              {navItems.map(item => {
                const Icon = item.icon;
                const active = currentPage === item.key;
                return (
                  <button key={item.key} type="button" onClick={() => navigateMobile(item.key)}
                    className={`flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left font-heading text-base font-semibold tracking-wide ${active ? 'bg-brand-yellow text-black' : 'text-ink-300 hover:bg-white/5'}`}>
                    <Icon className="h-[22px] w-[22px]" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {showMobileMore && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowMobileMore(false)}>
          <div
            className="absolute inset-x-3 bottom-20 rounded-2xl border border-white/10 bg-black/95 p-3 text-white shadow-2xl backdrop-blur-xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="font-semibold">More</p>
              <button type="button" onClick={() => setShowMobileMore(false)} className="p-2 text-ink-300" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {mobileMoreItems.map(item => {
                const Icon = item.icon;
                const active = currentPage === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigateMobile(item.key)}
                    className={`flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-sm font-medium ${
                      active ? 'bg-brand-yellow text-brand-pure' : 'bg-white/5 text-ink-300'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-around px-2 py-2">
          {mobilePrimaryItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigateMobile(item.key)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  active ? 'text-brand-yellow' : 'text-ink-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}

          {/* Center Add button */}
          <button
            onClick={onAddMember}
            className="flex flex-col items-center justify-center -mt-6"
          >
            <div className="w-14 h-14 bg-brand-yellow rounded-full flex items-center justify-center shadow-lg ring-4 ring-brand-pure active:scale-90 transition-transform">
              <Plus className="w-7 h-7 text-brand-pure" strokeWidth={2.5} />
            </div>
          </button>

          <button
            onClick={() => navigateMobile('reminders')}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
              currentPage === 'reminders' ? 'text-brand-yellow' : 'text-ink-400'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px] font-medium">Reminders</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileMore(open => !open)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
              mobileMoreItems.some(item => item.key === currentPage) || showMobileMore ? 'text-brand-yellow' : 'text-ink-400'
            }`}
            aria-expanded={showMobileMore}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
