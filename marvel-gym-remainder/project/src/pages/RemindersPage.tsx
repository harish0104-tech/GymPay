import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Reminder, type Member, type Membership, type NotificationDeliveryLog } from '@/lib/localData';
import { formatDate, formatCurrency, todayInKolkata } from '@/lib/utils';
import MemberPhoto from '@/components/MemberPhoto';
import { Bell, CheckCircle2, XCircle, Clock, Calendar, Send, Loader2, AlertTriangle } from 'lucide-react';
import { clearNotificationBadge } from '@/lib/notificationBadge';

type TabKey = 'today' | 'upcoming' | 'sent' | 'failed';
type ReminderRow = Reminder & { member?: Member; delivery_logs?: NotificationDeliveryLog[]; preview?: boolean };

export default function RemindersPage() {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [todayMemberships, setTodayMemberships] = useState<Membership[]>([]);
  const [reminderError, setReminderError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upcomingMemberships, setUpcomingMemberships] = useState<Membership[]>([]);
  const [upcomingError, setUpcomingError] = useState(false);
  const [tab, setTab] = useState<TabKey>('today');
  const [sending, setSending] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<{ title: string; message: string; push_status: string; error_message: string | null } | null>(null);

  const loadReminders = useCallback(async () => {
    if (!gym) return;
    setLoading(true);
    const today = todayInKolkata();
    // Read all membership versions before choosing the latest, so renewals
    // and cancelled memberships cannot leave stale expiry entries behind.
    const memberships: Membership[] = [];
    let membershipError = false;
    for (let offset = 0; ; offset += 500) {
      const { data: batch, error } = await localData.from('memberships')
        .select('*, member:members(*), plan:plans(*)')
        .eq('gym_id', gym.id)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + 499);
      if (error) { membershipError = true; break; }
      memberships.push(...(batch as Membership[] ?? []));
      if (!batch || batch.length < 500) break;
    }
    const latest = new Map<string, Membership>();
    memberships.forEach(m => { if (!latest.has(m.member_id)) latest.set(m.member_id, m); });
    setUpcomingError(membershipError);
    setTodayMemberships(membershipError ? [] : [...latest.values()]
      .filter(m => m.member?.is_active && ['active', 'expiring_soon', 'expired'].includes(m.status) && m.expiry_date === today));
    setUpcomingMemberships(membershipError ? [] : [...latest.values()]
      .filter(m => m.member?.is_active && ['active', 'expiring_soon'].includes(m.status) && m.expiry_date > today)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)
        || (a.member?.name ?? '').localeCompare(b.member?.name ?? '')
        || a.id.localeCompare(b.id)));
    const { data: ownerStatus } = await localData.from('owner_daily_notifications').select('*')
      .eq('gym_id', gym.id).eq('notification_date', today).eq('notification_type', 'no_clients_due').maybeSingle();
    setDailyStatus((ownerStatus as any) ?? null);
    const history: ReminderRow[] = [];
    let historyError = false;
    for (let offset = 0; ; offset += 500) {
    const { data, error } = await localData.from('reminders')
      .select('*, member:members(*), delivery_logs:notification_delivery_logs(*)')
      .eq('gym_id', gym.id)
      .order('scheduled_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 499);
    if (error) { historyError = true; break; }
    history.push(...(data as ReminderRow[] ?? []));
    if (!data || data.length < 500) break;
    }
    setReminderError(historyError);
    const loaded = (historyError ? [] : history).map(reminder => ({
      ...reminder,
      delivery_logs: reminder.delivery_logs?.filter(log => log.channel !== ('email' as string)),
    }));
    setReminders(loaded);
    setLoading(false);
  }, [gym]);

  useEffect(() => {
    loadReminders();
    // Loading the owner notification inbox marks the app-icon count as read.
    clearNotificationBadge();
  }, [loadReminders]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadReminders();
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadReminders]);

  const handleSendNow = async () => {
    if (!gym) {
      toast('No gym account is selected.', 'error');
      return;
    }
    setSending(true);
    try {
      toast('Frontend demo: reminders are displayed locally. Sending notifications requires a backend.', 'info');

      loadReminders();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send reminders', 'error');
    } finally {
      setSending(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'sent', label: 'Sent' },
    { key: 'failed', label: 'Failed' },
  ];

  const reminderGroups = useMemo(() => {
    const today = todayInKolkata();
    const todayRows = reminders.filter(reminder => reminder.scheduled_date === today);
    const previews: ReminderRow[] = todayMemberships
      .filter(m => !todayRows.some(r => r.membership_id === m.id && r.reminder_type === 'on_expiry_date'))
      .map(m => ({
        id: `preview-${m.id}`, gym_id: m.gym_id, member_id: m.member_id,
        membership_id: m.id, member: m.member, reminder_type: 'on_expiry_date',
        scheduled_date: today, channel: 'in_app', status: 'pending',
        message: `${m.plan?.name ?? 'Membership'} expires today. No expiry-day reminder has been generated yet.`,
        sent_at: null, failure_reason: null, created_at: m.created_at, preview: true,
      }));
    return {
      today: [...todayRows, ...previews].sort((a, b) => (a.member?.name ?? '').localeCompare(b.member?.name ?? '') || a.id.localeCompare(b.id)),
      upcoming: reminders.filter(reminder => reminder.scheduled_date > today && ['scheduled', 'pending'].includes(reminder.status)),
      sent: reminders.filter(reminder => reminder.status === 'sent' && !reminder.delivery_logs?.some(log => log.status === 'failed')),
      failed: reminders.filter(reminder => reminder.status === 'failed' || reminder.delivery_logs?.some(log => log.status === 'failed')),
    } satisfies Record<TabKey, typeof reminders>;
  }, [reminders, todayMemberships]);

  const visibleReminders = reminderGroups[tab];
  const hasFailed = tab !== 'upcoming' && visibleReminders.some(r => r.status === 'failed' || r.delivery_logs?.some(log => log.status === 'failed'));
  const tabError = tab === 'upcoming' ? upcomingError : reminderError || (tab === 'today' && upcomingError);

  return (
    <div className="max-w-5xl mx-auto px-4 pb-4 pt-7 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">REMINDERS</h1>
        </div>
        <button onClick={handleSendNow} disabled={sending} className="btn-primary h-11 shrink-0 whitespace-nowrap px-4 text-[13px] sm:px-5 sm:text-sm">
          {sending ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" /> : <Send className="h-[18px] w-[18px] shrink-0" />}
          <span className="hidden md:inline">Send Reminders Now</span>
          <span className="md:hidden">Send Now</span>
        </button>
      </div>

      {/* Delivery warning */}
      {tab === 'today' && !loading && !tabError && visibleReminders.length === 0 && dailyStatus && (
        <div className="card p-4 mb-4 border-status-active/30 bg-status-active-bg/50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-status-active flex-shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-status-active">{dailyStatus.title}</p><p className="text-sm text-ink-600 mt-1">{dailyStatus.message}</p><p className="text-xs text-ink-400 mt-1">Browser push: {dailyStatus.push_status}{dailyStatus.error_message ? ` • ${dailyStatus.error_message}` : ''}</p></div>
          </div>
        </div>
      )}

      {hasFailed && (
        <div className="card p-4 mb-4 border-status-danger/30 bg-status-danger-bg/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-status-danger">Notification delivery failed</p>
              <p className="text-xs text-ink-500 mt-1">
                The reminder was retained in-app. Open its delivery details below to see which optional channel failed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.key ? 'bg-brand-yellow text-brand-pure' : 'bg-white text-ink-700 border border-ink-200 hover:border-ink-400'}`}>
            <span>{t.label}</span>
            <span className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              tab === t.key ? 'bg-black/15 text-black' : 'bg-ink-100 text-ink-500'
            }`}>
              {loading || (t.key === 'upcoming' ? upcomingError : reminderError || (t.key === 'today' && upcomingError)) ? '—' : t.key === 'upcoming' ? upcomingMemberships.length : reminderGroups[t.key].length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading reminders...</div>
      ) : tabError ? (
        <div className="card p-8 text-center" role="alert"><p className="text-status-danger">Could not load {tab} details. Please try again.</p><button type="button" className="btn-ghost mt-2" onClick={loadReminders}>Try again</button></div>
      ) : tab === 'upcoming' ? (
        <div>
          <p className="mb-4 text-sm text-ink-500">Upcoming membership expiries, nearest date first. These are previews, not sent notifications.</p>
          {upcomingError ? (
            <div className="card p-6 text-center"><p className="text-status-danger">Could not load upcoming expiries.</p><button type="button" className="btn-ghost mt-2" onClick={loadReminders}>Try again</button></div>
          ) : upcomingMemberships.length === 0 ? (
            <div className="card p-8 text-center text-ink-500" role="status">No upcoming expiries. No active memberships have future expiry dates.</div>
          ) : (
            <div className="space-y-2">
              {upcomingMemberships.map(m => (
                <div key={m.id} className="card flex items-start gap-3 p-3 md:p-4">
                  <MemberPhoto url={m.member?.photo_url ?? null} name={m.member?.name ?? '?'} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{m.member?.name}</p>
                    <p className="text-sm text-ink-500">{m.plan?.name ?? 'Membership'}</p>
                    <p className="mt-1 text-sm text-ink-700">Expires {formatDate(m.expiry_date)}{m.plan ? ` · ${formatCurrency(m.plan.price)}` : ''}</p>
                  </div>
                  <span className="badge-inactive shrink-0">Upcoming</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : visibleReminders.length === 0 ? (
        <div className="card p-12 text-center" role="status">
          <div className="w-14 h-14 bg-status-active-bg rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-status-active" />
          </div>
          <h3 className="font-display text-2xl tracking-wide mb-2">{tab === 'today' ? 'No messages today' : tab === 'sent' ? 'No sent reminders' : 'No failed reminders'}</h3>
          <p className="text-ink-500">
            {tab === 'today' && 'No reminders or membership expiries for today.'}
            {tab === 'sent' && 'No sent reminders yet.'}
            {tab === 'failed' && 'No failed reminders.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleReminders.map(r => (
            <div key={r.id} className="card p-3 md:p-4 flex items-start gap-3">
              <MemberPhoto url={r.member?.photo_url ?? null} name={r.member?.name ?? '?'} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{r.member?.name ?? 'Unknown'}</p>
                <p className="text-sm text-ink-500">
                  {r.reminder_type === 'one_day_before_expiry' ? 'Upcoming expiry reminder' : 'Expiry-date reminder'}
                </p>
                <p className="text-xs text-ink-400 mt-0.5">
                  {formatDate(r.scheduled_date)} • {r.channel === 'whatsapp' ? 'WhatsApp' : 'In-App'}
                </p>
                {r.failure_reason && (
                  <p className="text-xs text-status-danger mt-1">{r.failure_reason}</p>
                )}
                <p className="text-sm text-ink-700 mt-2 whitespace-normal break-words">{r.message || 'No reminder content was saved.'}</p>
                {r.delivery_logs && r.delivery_logs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.delivery_logs.map(log => (
                      <span key={log.id} title={log.error_message ?? undefined}
                        className={`text-[10px] px-2 py-0.5 rounded-full ${log.status === 'sent' ? 'bg-status-active-bg text-status-active' : log.status === 'failed' ? 'bg-status-danger-bg text-status-danger' : 'bg-ink-100 text-ink-500'}`}>
                        {formatDeliveryChannel(log.channel)}: {log.status}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {r.preview ? <span className="badge-pending">Due today</span> : <ReminderStatusBadge status={r.delivery_logs?.some(log => log.status === 'failed') ? 'failed' : r.status} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDeliveryChannel(channel: string): string {
  if (channel === 'browser_push') return 'Browser';
  if (channel === 'in_app') return 'In-App';
  return channel;
}

function ReminderStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'sent': return <span className="badge-active flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Sent</span>;
    case 'failed': return <span className="badge-danger flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span>;
    case 'pending': return <span className="badge-pending flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
    case 'scheduled': return <span className="badge-inactive flex items-center gap-1"><Calendar className="w-3 h-3" /> Scheduled</span>;
    case 'skipped': return <span className="badge-inactive">Skipped</span>;
    default: return <span className="badge-inactive">{status}</span>;
  }
}
