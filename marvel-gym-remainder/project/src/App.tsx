import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import LoginPage from '@/pages/LoginPage';
import AppShell, { type PageKey } from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import MembersPage, { type MembersFilterKey } from '@/pages/MembersPage';
import MemberProfilePage from '@/pages/MemberProfilePage';
import PlansPage from '@/pages/PlansPage';
import PaymentsPage, { type PaymentsFilterKey } from '@/pages/PaymentsPage';
import RemindersPage from '@/pages/RemindersPage';
import SettingsPage from '@/pages/SettingsPage';
import AddMemberModal from '@/components/AddMemberModal';
import NotificationSetupPrompt from '@/components/NotificationSetupPrompt';
import { clearNotificationBadge } from '@/lib/notificationBadge';
import { isNativeApp, registerNativePushDevice } from '@/lib/nativeNotifications';

const pageKeys: PageKey[] = ['dashboard', 'members', 'plans', 'payments', 'reminders', 'settings'];
const pagePaths: Record<PageKey, string> = {
  dashboard: '/dashboard',
  members: '/members',
  plans: '/plans',
  payments: '/payments',
  reminders: '/reminders',
  settings: '/settings',
};

function readRoute(): { page: PageKey; memberId: string | null } {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const legacyPage = new URLSearchParams(window.location.search).get('page') as PageKey | null;
  const page = pageKeys.includes(parts[0] as PageKey)
    ? parts[0] as PageKey
    : legacyPage && pageKeys.includes(legacyPage) ? legacyPage : 'dashboard';
  return { page, memberId: page === 'members' && parts[1] ? decodeURIComponent(parts[1]) : null };
}

function AppContent() {
  const { session, gym, loading } = useAuth();
  const [initialRoute] = useState(readRoute);
  const [page, setPage] = useState<PageKey>(initialRoute.page);
  const [visitedPages, setVisitedPages] = useState<Set<PageKey>>(() => new Set([initialRoute.page]));
  const [viewMemberId, setViewMemberId] = useState<string | null>(initialRoute.memberId);
  const [showAddMember, setShowAddMember] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [dashboardFilterRequest, setDashboardFilterRequest] = useState<{
    page: 'members' | 'payments';
    value: MembersFilterKey | PaymentsFilterKey;
    id: number;
  } | null>(null);
  const previousUserId = useRef<string | null | undefined>(undefined);


  useEffect(() => {
    if (loading) return;
    const currentUserId = session?.user.id ?? null;

    // Reset only after an actual login. An existing session restored during an
    // app launch keeps its last page, and background token refreshes do nothing.
    if (previousUserId.current === null && currentUserId) {
      setPage('dashboard');
      setViewMemberId(null);
      setVisitedPages(previous => new Set([...previous, 'dashboard']));
      window.history.replaceState({}, '', '/dashboard');
    } else if (currentUserId) {
      const firstPathPart = window.location.pathname.split('/').filter(Boolean)[0];
      if (!pageKeys.includes(firstPathPart as PageKey)) {
        window.history.replaceState({}, '', '/dashboard');
      }
    }

    previousUserId.current = currentUserId;
  }, [loading, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id || !gym?.id) return;
    void registerNativePushDevice(gym.id).catch(error => {
      console.error('Native push registration failed:', error instanceof Error ? error.message : error);
    });
  }, [session?.user.id, gym?.id]);

  useEffect(() => {
    const handlePopState = () => {
      const route = readRoute();
      setPage(route.page);
      setViewMemberId(route.memberId);
      setVisitedPages(previous => new Set([...previous, route.page]));
      if (route.page === 'reminders') clearNotificationBadge();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (loading) {
    return (
      <div className="relative min-h-[100svh] overflow-hidden bg-black">
        <img
          src="/mobile-onboarding-v3.png"
          alt="MFC Stronger Every Day"
          className="absolute inset-0 h-full w-full object-cover md:hidden"
        />
        <div className="hidden min-h-screen items-center justify-center md:flex">
          <img src="/mfc-icon-v2-192.png" alt="MFC" className="h-20 w-32 object-contain" />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  const handleNavigate = (p: PageKey) => {
    setViewMemberId(null);
    setVisitedPages(previous => {
      if (previous.has(p)) return previous;
      const next = new Set(previous);
      next.add(p);
      return next;
    });
    setPage(p);
    if (window.location.pathname !== pagePaths[p] || window.location.search) {
      window.history.pushState({}, '', pagePaths[p]);
    }
    if (p === 'reminders') clearNotificationBadge();
  };

  const handleDashboardNavigate = (destination: 'members' | 'payments' | 'reminders', filter?: string) => {
    if (filter && (destination === 'members' || destination === 'payments')) {
      setDashboardFilterRequest({
        page: destination,
        value: filter as MembersFilterKey | PaymentsFilterKey,
        id: Date.now(),
      });
    }
    handleNavigate(destination);
  };

  const handleViewMember = (memberId: string) => {
    setPage('members');
    setVisitedPages(previous => new Set([...previous, 'members']));
    setViewMemberId(memberId);
    window.history.pushState({}, '', `/members/${encodeURIComponent(memberId)}`);
  };

  const handleBackFromMember = () => {
    setViewMemberId(null);
    setPage('members');
    window.history.pushState({}, '', '/members');
  };

  return (
    <AppShell
      currentPage={page}
      onNavigate={handleNavigate}
      onAddMember={() => setShowAddMember(true)}
    >
      {viewMemberId ? (
        <div>
          <MemberProfilePage
            memberId={viewMemberId}
            onBack={handleBackFromMember}
            onEditMember={() => {}}
          />
        </div>
      ) : null}

      {visitedPages.has('dashboard') ? (
        <div className={!viewMemberId && page === 'dashboard' ? 'block' : 'hidden'}>
          <DashboardPage
            key={`dashboard-${refreshCounter}`}
            onNavigate={handleDashboardNavigate}
            onViewMember={handleViewMember}
          />
        </div>
      ) : null}
      {visitedPages.has('members') ? (
        <div className={!viewMemberId && page === 'members' ? 'block' : 'hidden'}>
          <MembersPage
            key={`members-${refreshCounter}`}
            onViewMember={handleViewMember}
            onAddMember={() => setShowAddMember(true)}
            filterRequest={dashboardFilterRequest?.page === 'members'
              ? { value: dashboardFilterRequest.value as MembersFilterKey, id: dashboardFilterRequest.id }
              : null}
          />
        </div>
      ) : null}
      {visitedPages.has('plans') ? (
        <div className={!viewMemberId && page === 'plans' ? 'block' : 'hidden'}><PlansPage /></div>
      ) : null}
      {visitedPages.has('payments') ? (
        <div className={!viewMemberId && page === 'payments' ? 'block' : 'hidden'}>
          <PaymentsPage
            filterRequest={dashboardFilterRequest?.page === 'payments'
              ? { value: dashboardFilterRequest.value as PaymentsFilterKey, id: dashboardFilterRequest.id }
              : null}
          />
        </div>
      ) : null}
      {visitedPages.has('reminders') ? (
        <div className={!viewMemberId && page === 'reminders' ? 'block' : 'hidden'}><RemindersPage /></div>
      ) : null}
      {visitedPages.has('settings') ? (
        <div className={!viewMemberId && page === 'settings' ? 'block' : 'hidden'}><SettingsPage /></div>
      ) : null}

      <AddMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        onSaved={() => {
          setRefreshCounter(c => c + 1);
        }}
      />
    </AppShell>
  );
}

function PwaUpdatePrompt() {
  const [version, setVersion] = useState<string | null>(null);
  const nativeApp = isNativeApp();

  useEffect(() => {
    if (nativeApp) return;
    if (!('serviceWorker' in navigator)) return;
    const handleWorkerMessage = (event: MessageEvent<{ type?: string; version?: string }>) => {
      if (event.data?.type === 'MFC_APP_UPDATE') setVersion(event.data.version ?? 'new');
    };
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
  }, [nativeApp]);

  if (nativeApp || !version) return null;
  return (
    <div className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-xl items-center gap-3 rounded-xl bg-brand-pure px-4 py-3 text-white shadow-2xl">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">A new version is ready</p>
        <p className="text-xs text-ink-400">Refresh when convenient. Your saved data is safe.</p>
      </div>
      <button type="button" onClick={() => window.location.reload()} className="btn-primary shrink-0 px-3 py-2 text-sm">
        Refresh
      </button>
      <button type="button" onClick={() => setVersion(null)} className="shrink-0 px-1 text-ink-400" aria-label="Dismiss update">×</button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <PwaUpdatePrompt />
        <NotificationSetupPrompt />
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
