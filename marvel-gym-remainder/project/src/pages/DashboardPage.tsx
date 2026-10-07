import { useState, useEffect } from 'react';
import MemberPhoto from '@/components/MemberPhoto';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Membership } from '@/lib/supabase';
import { getGreeting, daysUntilExpiry, formatDate } from '@/lib/utils';
import { Users, UserCheck, CalendarClock, AlertCircle, Clock, ChevronRight, Bell, Menu } from 'lucide-react';

interface DashboardData {
  totalMembers: number;
  activeMembers: number;
  expiringTomorrow: number;
  expiredOrDue: number;
  pendingPayments: number;
  gymCount: number;
  boxingCount: number;
  bothCount: number;
  attentionItems: Membership[];
}

interface DashboardPageProps {
  onNavigate: (page: 'members' | 'payments' | 'reminders', filter?: string) => void;
  onViewMember: (memberId: string) => void;
}

export default function DashboardPage({ onNavigate, onViewMember }: DashboardPageProps) {
  const { profile, gym } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gym) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        { count: totalMembers },
        { count: activeMembers },
        { count: gymCount },
        { count: boxingCount },
        { count: bothCount },
        { data: memberships },
        { count: pendingCount },
      ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('is_active', true),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('is_active', true).eq('membership_type', 'gym'),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('is_active', true).eq('membership_type', 'boxing'),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('is_active', true).eq('membership_type', 'gym_boxing'),
        supabase.from('memberships').select('*, plan:plans(*), member:members(*)').eq('gym_id', gym.id).in('status', ['active', 'expiring_soon', 'expired']),
        supabase.from('payments').select('*', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('status', 'pending'),
      ]);

      if (cancelled) return;

      // Find latest membership per member
      const latestByMember = new Map<string, Membership>();
      (memberships as Membership[] ?? []).forEach(m => {
        const existing = latestByMember.get(m.member_id);
        if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
          latestByMember.set(m.member_id, m);
        }
      });


      let expiringTomorrow = 0;
      let expiredOrDue = 0;
      const attentionItems: Membership[] = [];

      latestByMember.forEach(m => {
        if (!m.member?.is_active) return;
        const days = daysUntilExpiry(m.expiry_date);
        if (days <= 1) attentionItems.push(m);
        if (days === 1) {
          expiringTomorrow++;
        } else if (days <= 0) {
          expiredOrDue++;
        }
      });

      setData({
        totalMembers: totalMembers ?? 0,
        activeMembers: activeMembers ?? 0,
        expiringTomorrow,
        expiredOrDue,
        pendingPayments: pendingCount ?? 0,
        gymCount: gymCount ?? 0,
        boxingCount: boxingCount ?? 0,
        bothCount: bothCount ?? 0,
        attentionItems: attentionItems.sort((a, b) => {
          // Newest expiry first, then name and ID for a stable order on refresh.
          return b.expiry_date.localeCompare(a.expiry_date)
            || (a.member?.name ?? '').localeCompare(b.member?.name ?? '', 'en', { sensitivity: 'base' })
            || a.member_id.localeCompare(b.member_id);
        }),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gym]);

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="animate-pulse text-ink-400">Loading dashboard...</div>
    </div>;
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="dashboard-theme min-h-screen px-4 pb-4 pt-6 md:p-8">
      <div className="relative z-10 mx-auto max-w-7xl">
      <div className="mb-8 flex items-center justify-between md:hidden">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('mfc:open-mobile-menu'))}
          className="rounded-xl border border-ink-200 bg-white p-2.5 text-ink-900 backdrop-blur-md" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <div aria-hidden="true" />
        <button type="button" onClick={() => onNavigate('reminders')}
          className="relative rounded-full border border-ink-200 bg-white p-2.5 text-ink-900 backdrop-blur-md" aria-label="Open reminders">
          <Bell className="h-6 w-6" />
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand-yellow ring-2 ring-white" />
        </button>
      </div>
      {/* Header */}
      <div className="dashboard-hero mb-6">
        <div className="dashboard-hero-copy">
        <p className="dashboard-eyebrow">MARVEL FITNESS CULTURE <span>/ OWNER OVERVIEW</span></p>
        <h1 className="font-display text-4xl leading-tight tracking-wide md:text-4xl">
          {getGreeting()},{' '}<span className="text-brand-yellow">{profile?.display_name?.split(' ')[0] ?? 'Owner'}</span>
        </h1>
        <div className="dashboard-date"><CalendarClock className="h-4 w-4" />{today}</div>
        </div>
        <div className="dashboard-hero-action">
          <button type="button" onClick={() => onNavigate('members', 'all')} className="btn-primary">Manage members <ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-6 lg:grid-cols-5 gap-2 md:gap-3 mb-3">
        <StatCard texture="/stat-members-texture.png" onClick={() => onNavigate('members', 'all')} className="col-span-2 lg:col-span-1" icon={Users} label="Total Members" value={data?.totalMembers ?? 0} />
        <StatCard texture="/stat-active-texture.png" onClick={() => onNavigate('members', 'active')} className="col-span-2 lg:col-span-1" icon={UserCheck} label="Active" value={data?.activeMembers ?? 0} color="text-status-active" />
        <StatCard texture="/stat-expiring-texture.png" onClick={() => onNavigate('members', 'expiring_tomorrow')} className="col-span-2 lg:col-span-1" icon={CalendarClock} label="Expiring Tomorrow" value={data?.expiringTomorrow ?? 0} color="text-status-warning" />
        <StatCard texture="/stat-expired-texture.png" onClick={() => onNavigate('members', 'expired')} className="col-span-3 lg:col-span-1" icon={AlertCircle} label="Expired" value={data?.expiredOrDue ?? 0} color="text-status-danger" />
        <StatCard texture="/stat-pending-texture.png" onClick={() => onNavigate('payments', 'pending')} className="col-span-3 lg:col-span-1" icon={Clock} label="Pending Payments" value={data?.pendingPayments ?? 0} color="text-status-pending" />
      </div>

      {/* Membership breakdown */}
      <div className="dashboard-breakdown grid grid-cols-3 gap-3 mb-6">
        <BreakdownCard onClick={() => onNavigate('members', 'gym')} label="Gym" value={data?.gymCount ?? 0} />
        <BreakdownCard onClick={() => onNavigate('members', 'boxing')} label="Boxing" value={data?.boxingCount ?? 0} />
        <BreakdownCard onClick={() => onNavigate('members', 'gym_boxing')} label="Gym + Boxing" value={data?.bothCount ?? 0} />
      </div>

      <section className="renewal-list" aria-labelledby="renewal-heading">
        <div className="renewal-header">
          <div className="flex items-center gap-2">
            <h2 id="renewal-heading">Needs your attention</h2>
            <span className="renewal-count">{data?.attentionItems.length ?? 0}</span>
          </div>
          <button type="button" onClick={() => onNavigate('reminders')} className="renewal-view">View all <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
        {(data?.attentionItems.length ?? 0) === 0 ? (
          <p className="py-5 text-sm text-ink-400">All clear. No memberships need attention.</p>
        ) : (
          <ul>
            {data?.attentionItems.slice(0, 5).map(m => {
              const days = daysUntilExpiry(m.expiry_date);
              const status = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : 'Due tomorrow';
              return (
                <li key={m.id}>
                  <button type="button" className="renewal-row" onClick={() => onViewMember(m.member_id)} aria-label={`View ${m.member?.name}, ${status}`}>
                    <MemberPhoto url={m.member?.photo_url ?? null} name={m.member?.name ?? 'Member'} size="sm" />
                    <span className="min-w-0">
                      <span className="renewal-name">{m.member?.name}</span>
                      <span className="renewal-plan">{m.plan?.name ?? 'Membership'}</span>
                    </span>
                    <span className="renewal-date">{formatDate(m.expiry_date)}</span>
                    <span className={`renewal-status ${days < 0 ? 'is-overdue' : ''}`}>{status}</span>
                    <ChevronRight className="h-4 w-4 text-ink-400" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {(data?.attentionItems.length ?? 0) > 5 && <button type="button" className="renewal-more" onClick={() => onNavigate('reminders')}>See all {data?.attentionItems.length} memberships needing attention</button>}
      </section>

      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, onClick, texture, color = 'text-brand-yellow', className = '' }: { icon: typeof Users; label: string; value: number; onClick: () => void; texture?: string; color?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`View ${label}`} className={`card dashboard-stat group relative isolate min-h-32 overflow-hidden p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-yellow/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow md:min-h-0 ${className}`}>
      {texture && (
        <>
          <img src={texture} alt="" aria-hidden="true" className="stat-card-texture pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-[0.55] mix-blend-screen transition-all duration-300 group-hover:scale-105 group-hover:opacity-70" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" aria-hidden="true" />
        </>
      )}
      <div className="relative z-10 mb-2 flex items-center justify-between">
        <Icon className={`w-5 h-5 ${color}`} />
        <ChevronRight className="stat-arrow h-4 w-4 text-ink-400" />
      </div>
      <p className="relative z-10 font-display text-3xl tracking-wide">{value}</p>
      <p className="relative z-10 mt-0.5 text-xs text-ink-500">{label}</p>
    </button>
  );
}

function BreakdownCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`View ${label} members`} className="card p-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </button>
  );
}
