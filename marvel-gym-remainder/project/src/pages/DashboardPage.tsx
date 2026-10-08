import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Member, type Membership, type Payment } from '@/lib/localData';
import { daysUntilExpiry, formatCurrency, getGreeting, todayInKolkata } from '@/lib/utils';
import { Plus, Menu, Bell, Users, UserCheck, CalendarClock, Wallet, IndianRupee, Check, Send } from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (page: 'members' | 'payments' | 'reminders', filter?: string) => void;
  onViewMember: (memberId: string) => void;
  onAddMember: () => void;
}
interface DashboardData { members: Member[]; memberships: Membership[]; payments: Payment[]; }
export default function DashboardPage({ onNavigate, onViewMember, onAddMember }: DashboardPageProps) {
  const { gym } = useAuth(); const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!gym) return;
    const results = await Promise.all([
      localData.from('members').select('*').eq('gym_id', gym.id),
      localData.from('memberships').select('*, member:members(*), plan:plans(*)').eq('gym_id', gym.id),
      localData.from('payments').select('*, member:members(*)').eq('gym_id', gym.id),
    ]);
    if (results.some(r => r.error)) { setError(true); return; }
    setError(false);
    setData({ members: results[0].data as Member[], memberships: results[1].data as Membership[], payments: results[2].data as Payment[] });
  }, [gym]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="p-6">Unable to load local data. <button className="btn-primary" onClick={() => void load()}>Retry</button></div>;
  if (!data) return <div className="p-6 text-ink-500">Loading dashboard…</div>;
  const today = todayInKolkata();
  const latest = new Map<string, Membership>();
  for (const membership of data.memberships) {
    const previous = latest.get(membership.member_id);
    if (!previous || membership.created_at >= previous.created_at) latest.set(membership.member_id, membership);
  }
  const expiring = [...latest.values()].filter(m => m.member?.is_active && daysUntilExpiry(m.expiry_date) >= 0 && daysUntilExpiry(m.expiry_date) <= 7);
  const active = [...latest.values()].filter(m => m.member?.is_active && daysUntilExpiry(m.expiry_date) >= 0).length;
  const unpaid = data.payments.filter(p => p.status === 'pending' || p.status === 'due');
  const dueToday = data.payments.filter(p => ((p.status === 'pending' || p.status === 'due') && p.payment_date <= today) || (p.status === 'paid' && p.payment_date === today));
  const collection = data.payments.filter(p => p.status === 'paid' && p.payment_date === today).reduce((sum,p) => sum + Number(p.amount),0);
  async function remind(memberships: Membership[]) {
    setBusy('reminders');
    let queued = 0;
    for (const m of memberships) {
      const existing = await localData.from('reminders').select().eq('membership_id', m.id).eq('scheduled_date',today).eq('channel','in_app');
      if (existing.error) { toast(existing.error.message,'error'); setBusy(null); return; }
      if (Array.isArray(existing.data) && existing.data.length) continue;
      const result = await localData.from('reminders').insert({ gym_id: gym!.id, member_id: m.member_id, membership_id: m.id, reminder_type: 'on_expiry_date', scheduled_date: today, channel: 'in_app', status: 'pending', message: `${m.member?.name ?? 'Member'}: membership payment reminder.`, sent_at: null, failure_reason: null });
      if (result.error) { toast(result.error.message,'error'); setBusy(null); return; }
      queued++;
    }
    toast(queued ? `${queued} reminder(s) saved locally. External delivery is unavailable in this frontend demo.` : 'These reminders are already saved locally.', 'info');
    setBusy(null);
  }
  async function paid(payment: Payment) {
    if (!window.confirm(`Mark ${formatCurrency(payment.amount)} from ${payment.member?.name ?? 'this member'} as paid?`)) return;
    setBusy(payment.id);
    const result = await localData.from('payments').update({ status: 'paid', payment_date: today }).eq('id',payment.id);
    if (result.error) toast(result.error.message,'error'); else { toast('Payment marked as paid.'); await load(); }
    setBusy(null);
  }
  const stats = [
    { label: 'Members', value: data.members.length, icon: Users, action: () => onNavigate('members','all') },
    { label: 'Active', value: active, icon: UserCheck, action: () => onNavigate('members','active') },
    { label: 'Expiring in 7 Days', value: expiring.length, icon: CalendarClock, action: () => onNavigate('members','expiring_soon') },
    { label: 'Payment Due', value: formatCurrency(unpaid.reduce((sum,p) => sum + Number(p.amount),0)), icon: Wallet, action: () => onNavigate('payments','all') },
    { label: "Today's Collection", value: formatCurrency(collection), icon: IndianRupee, action: () => onNavigate('payments','paid') },
  ];
  return <div className="gympay-dashboard px-4 py-6 md:px-8 md:py-10"><div className="mx-auto max-w-6xl">
    <header className="mb-7 flex items-center justify-between gap-3">
      <div><p className="mb-2 text-xs font-bold tracking-[0.2em] text-ink-500">GYM PAY</p><h1 className="font-heading text-2xl font-bold uppercase tracking-wide sm:text-3xl">{getGreeting()} <span aria-label="Hello">👋</span></h1></div>
      <div className="flex gap-2"><button className="gp-icon-button md:hidden" aria-label="Open menu" onClick={() => window.dispatchEvent(new CustomEvent('mfc:open-mobile-menu'))}><Menu size={20}/></button><button className="gp-icon-button" aria-label="View reminders" onClick={() => onNavigate('reminders')}><Bell size={20}/></button></div>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map(({label,value,icon:Icon,action},i) => <button key={label} onClick={action} className={`gp-stat ${i===4 ? 'col-span-2 lg:col-span-1' : ''}`}><div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-ink-500 sm:text-sm">{label}</span><Icon size={18} className="shrink-0 text-ink-400"/></div><p className="text-3xl font-bold tracking-tight sm:text-4xl">{value}</p></button>)}</div>
    <button onClick={onAddMember} className="gp-add my-6 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold tracking-wider"><Plus size={22}/> ADD MEMBER</button>
    <section className="gp-panel" aria-labelledby="due-heading"><div className="gp-section-heading"><h2 id="due-heading">PAYMENT DUE TODAY</h2><span className="text-xs font-normal text-ink-500">{dueToday.length} payments</span></div>
      {dueToday.length ? <ul className="divide-y divide-ink-100">{dueToday.map(p => <li key={p.id} className="flex items-center gap-3 px-4 py-4 sm:px-6"><button onClick={() => onViewMember(p.member_id)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline sm:text-base">{p.member?.name ?? 'Member'}</button><span className="text-sm font-bold tabular-nums sm:text-base">{formatCurrency(p.amount)}</span>{p.status === 'paid' ? <span className="gp-paid"><Check size={14}/> PAID</span> : <><button disabled={!!busy} className="gp-remind" onClick={() => { const m = latest.get(p.member_id); if (m) void remind([m]); else toast('No membership found for this member.','info'); }}>REMIND</button><button disabled={!!busy} className="gp-pay" onClick={() => void paid(p)} aria-label={`Mark ${p.member?.name ?? 'member'} as paid`} title="Mark as paid"><Check size={17}/></button></>}</li>)}</ul> : <p className="px-6 py-8 text-sm text-ink-500">All clear. No payments due today.</p>}
    </section>
    <section className="gp-panel mt-5" aria-labelledby="expiring-heading"><div className="gp-section-heading"><h2 id="expiring-heading">EXPIRING SOON</h2><span className="text-xs font-normal text-ink-500">Next 7 days</span></div><div className="flex items-center justify-between gap-4 px-4 py-5 sm:px-6"><button onClick={() => onNavigate('members','expiring_soon')} className="text-left text-lg font-semibold hover:underline">{expiring.length} <span className="font-normal text-ink-500">members</span></button><button disabled={!expiring.length || !!busy} onClick={() => void remind(expiring)} className="gp-remind flex items-center gap-2"><Send size={14}/> SEND ALL</button></div></section>
  </div></div>;
}
