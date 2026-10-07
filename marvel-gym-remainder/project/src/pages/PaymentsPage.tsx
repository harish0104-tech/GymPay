import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase, type Payment, type Member } from '@/lib/supabase';
import { formatDate, formatCurrency, todayInKolkata, getRelativeDateLabel } from '@/lib/utils';
import MemberPhoto from '@/components/MemberPhoto';
import MembershipTypeBadge from '@/components/MembershipTypeBadge';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import ExportPaymentsModal from '@/components/ExportPaymentsModal';
import { Search, TrendingUp, Clock, CalendarDays, AlertCircle, Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface PaymentWithMember extends Payment {
  member: Member;
}

export type PaymentsFilterKey = 'all' | 'paid' | 'pending' | 'due';
type CollectionPeriod = 'day' | 'month';

interface PaymentsPageProps {
  filterRequest?: { value: PaymentsFilterKey; id: number } | null;
}

const initialDate = todayInKolkata();
const PAYMENTS_PER_PAGE = 10;

function getPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 3) return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

function formatRecordedTime(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PaymentsPage({ filterRequest }: PaymentsPageProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<PaymentsFilterKey>('all');
  const [period, setPeriod] = useState<CollectionPeriod>('day');
  const [selectedDay, setSelectedDay] = useState(initialDate);
  const [selectedMonth, setSelectedMonth] = useState(initialDate.slice(0, 7));
  const [stats, setStats] = useState({ collectedToday: 0, collectedMonth: 0, pendingAmount: 0, dueMembers: 0 });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);

  const refreshStatsFrom = (records: PaymentWithMember[]) => {
    const today = todayInKolkata();
    const month = today.slice(0, 7);
    setStats({
      collectedToday: records.filter(p => p.status === 'paid' && p.payment_date === today).reduce((sum, p) => sum + Number(p.amount), 0),
      collectedMonth: records.filter(p => p.status === 'paid' && p.payment_date.startsWith(month)).reduce((sum, p) => sum + Number(p.amount), 0),
      pendingAmount: records.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0),
      dueMembers: records.filter(p => p.status === 'due').length,
    });
  };

  const deletePayment = async (payment: PaymentWithMember) => {
    if (!gym || !window.confirm(`Delete this ${formatCurrency(payment.amount)} payment for ${payment.member?.name ?? 'this member'}?`)) return;
    setDeletingId(payment.id);
    const { error } = await supabase.from('payments').delete().eq('id', payment.id).eq('gym_id', gym.id);
    setDeletingId(null);
    if (error) return toast(error.message, 'error');
    const remaining = payments.filter(item => item.id !== payment.id);
    setPayments(remaining);
    refreshStatsFrom(remaining);
    toast('Payment deleted.');
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (filterRequest) setFilter(filterRequest.value);
  }, [filterRequest]);

  useEffect(() => {
    if (!gym) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = todayInKolkata();
      const monthStart = today.slice(0, 7) + '-01';
      const nextMonthDate = new Date(`${monthStart}T00:00:00`);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      const nextMonthStart = [
        nextMonthDate.getFullYear(),
        String(nextMonthDate.getMonth() + 1).padStart(2, '0'),
        '01',
      ].join('-');

      const [
        { data: payData },
        { data: monthData },
        { data: pendingData },
        { data: todayData },
      ] = await Promise.all([
        supabase.from('payments').select('*, member:members(*)').eq('gym_id', gym.id).order('created_at', { ascending: false }).limit(1000),
        supabase.from('payments').select('amount').eq('gym_id', gym.id).eq('status', 'paid').gte('payment_date', monthStart).lt('payment_date', nextMonthStart),
        supabase.from('payments').select('amount').eq('gym_id', gym.id).eq('status', 'pending'),
        supabase.from('payments').select('amount').eq('gym_id', gym.id).eq('status', 'paid').eq('payment_date', today),
      ]);

      if (cancelled) return;

      const loadedPayments = (payData ?? []) as PaymentWithMember[];
      const paidThisMonth = (monthData ?? []) as Array<{ amount: number }>;
      const pendingPayments = (pendingData ?? []) as Array<{ amount: number }>;
      const paidToday = (todayData ?? []) as Array<{ amount: number }>;
      setPayments(loadedPayments);
      setStats({
        collectedToday: paidToday.reduce((sum, payment) => sum + Number(payment.amount), 0),
        collectedMonth: paidThisMonth.reduce((sum, payment) => sum + Number(payment.amount), 0),
        pendingAmount: pendingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        dueMembers: loadedPayments.filter(payment => payment.status === 'due').length,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gym]);

  const periodPayments = useMemo(() => payments.filter(p => (
    period === 'day'
      ? p.payment_date === selectedDay
      : p.payment_date.startsWith(selectedMonth)
  )), [payments, period, selectedDay, selectedMonth]);

  const filteredPayments = periodPayments.filter(p => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      if (!p.member?.name?.toLowerCase().includes(q) && !p.member?.phone?.includes(q)) return false;
    }
    if (filter !== 'all' && p.status !== filter) return false;
    return true;
  });

  const selectedPaidPayments = periodPayments.filter(p => p.status === 'paid');
  const selectedTotal = selectedPaidPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const selectedPeriodLabel = period === 'day'
    ? formatDate(selectedDay)
    : new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAYMENTS_PER_PAGE));
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * PAYMENTS_PER_PAGE;
    return filteredPayments.slice(start, start + PAYMENTS_PER_PAGE);
  }, [filteredPayments, currentPage]);
  const paginationItems = useMemo(() => getPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filter, period, selectedDay, selectedMonth]);

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const filters: { key: PaymentsFilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'pending', label: 'Pending' },
    { key: 'due', label: 'Due' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-4 pt-7 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">PAYMENTS</h1>
          <p className="text-ink-500 mt-1">Track all payment records</p>
        </div>
        <button type="button" onClick={() => setExportOpen(true)} className="btn-primary shrink-0">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export PDF</span>
          <span className="sm:hidden">Export</span>
        </button>
      </div>

      <ExportPaymentsModal
        open={exportOpen}
        initialMonth={selectedMonth}
        onClose={() => setExportOpen(false)}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={TrendingUp} label="Collected Today" value={formatCurrency(stats.collectedToday)} />
        <SummaryCard icon={CalendarDays} label="Collected This Month" value={formatCurrency(stats.collectedMonth)} />
        <SummaryCard icon={Clock} label="Pending Amount" value={formatCurrency(stats.pendingAmount)} color="text-status-pending" />
        <SummaryCard icon={AlertCircle} label="Due Members" value={String(stats.dueMembers)} color="text-status-danger" />
      </div>

      {/* Collection period */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Collection report</p>
            <div className="mt-2 inline-flex rounded-lg bg-ink-100 p-1">
              {(['day', 'month'] as CollectionPeriod[]).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold capitalize transition-colors ${period === option ? 'bg-brand-yellow text-brand-pure shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <label className="block sm:w-56">
            <span className="mb-1.5 block text-xs font-semibold text-ink-500">
              Select {period === 'day' ? 'date' : 'month'}
            </span>
            <input
              type={period === 'day' ? 'date' : 'month'}
              value={period === 'day' ? selectedDay : selectedMonth}
              onChange={event => period === 'day' ? setSelectedDay(event.target.value) : setSelectedMonth(event.target.value)}
              className="input-field py-2.5"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-1 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink-900">{selectedPeriodLabel}</p>
            <p className="text-sm text-ink-500">{selectedPaidPayments.length} paid {selectedPaidPayments.length === 1 ? 'payment' : 'payments'}</p>
          </div>
          <p className="font-display text-2xl tracking-wide text-ink-900">{formatCurrency(selectedTotal)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-11" placeholder="Search by member name or phone..." />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === f.key ? 'bg-brand-yellow text-brand-pure' : 'bg-white text-ink-700 border border-ink-200 hover:border-ink-400'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading payments...</div>
      ) : filteredPayments.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-ink-500">No payment records found for {selectedPeriodLabel}.</p>
        </div>
      ) : (
        <>
        <div className="card divide-y divide-ink-200">
          {paginatedPayments.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 md:p-4">
              <MemberPhoto url={p.member?.photo_url ?? null} name={p.member?.name ?? '?'} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="font-semibold truncate">{p.member?.name ?? 'Unknown'}</p>
                  {p.member?.membership_type && (
                    <MembershipTypeBadge type={p.member.membership_type} />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-400">
                  {getRelativeDateLabel(p.payment_date)} ({formatDate(p.payment_date)}) • {formatRecordedTime(p.created_at)} IST • {p.payment_method ?? '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(p.amount)}</p>
                <PaymentStatusBadge status={p.status} />
              </div>
              <button aria-label={`Delete payment for ${p.member?.name ?? 'member'}`} disabled={deletingId === p.id} onClick={() => deletePayment(p)} className="rounded-lg p-2 text-status-danger hover:bg-status-danger-bg disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <nav className="mt-5 flex w-full items-center justify-center gap-1 sm:gap-2" aria-label="Payments pagination">
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-200 disabled:pointer-events-none disabled:text-ink-300 sm:h-10 sm:w-10"
              aria-label="Previous payments page"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {paginationItems.map((item, index) => item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="flex h-9 min-w-6 items-center justify-center text-sm text-ink-500 sm:h-10 sm:min-w-8" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setCurrentPage(item)}
                aria-label={`Go to payments page ${item}`}
                aria-current={currentPage === item ? 'page' : undefined}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors sm:h-10 sm:w-10 sm:text-base ${
                  currentPage === item
                    ? 'bg-brand-yellow text-brand-pure shadow-sm'
                    : 'text-ink-800 hover:bg-ink-200'
                }`}
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-200 disabled:pointer-events-none disabled:text-ink-300 sm:h-10 sm:w-10"
              aria-label="Next payments page"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </nav>
        )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color = 'text-ink-900' }: { icon: typeof TrendingUp; label: string; value: string; color?: string }) {
  return (
    <div className="card p-4">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className="font-display text-xl md:text-2xl tracking-wide">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </div>
  );
}
