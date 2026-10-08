import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Member, type Membership, type Plan } from '@/lib/localData';
import { formatDate, formatCurrency, getMembershipTypeLabel, daysUntilExpiry, getMembershipStatus, getDaysRemainingText } from '@/lib/utils';
import MemberPhoto from '@/components/MemberPhoto';
import { MembershipStatusBadge } from '@/components/StatusBadge';
import { Search, Plus, Users, Phone, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface MembersPageProps {
  onViewMember: (memberId: string) => void;
  onAddMember: () => void;
  filterRequest?: { value: MembersFilterKey; id: number } | null;
}

export type MembersFilterKey = 'all' | 'active' | 'expiring_tomorrow' | 'expiring_soon' | 'expired' | 'pending' | 'inactive' | 'gym' | 'boxing' | 'gym_boxing';

const MEMBERS_PER_PAGE = 10;

function getPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 3) return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

interface MemberWithMembership extends Member {
  latest_membership?: Membership & { plan?: Plan };
}

export default function MembersPage({ onViewMember, onAddMember, filterRequest }: MembersPageProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<MembersFilterKey>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const deleteMember = async (member: MemberWithMembership) => {
    if (!gym || !window.confirm(`Delete ${member.name}? Their memberships, reminders, and payment history will also be removed.`)) return;
    setDeletingId(member.id);
    const { error } = await localData.from('members').delete().eq('id', member.id).eq('gym_id', gym.id);
    setDeletingId(null);
    if (error) return toast(error.message, 'error');
    setMembers(current => current.filter(item => item.id !== member.id));
    toast(`${member.name} was deleted.`);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (filterRequest) setFilter(filterRequest.value);
  }, [filterRequest?.id]);

  useEffect(() => {
    if (!gym) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await localData.from('members')
        .select('*, latest_membership:memberships(*, plan:plans(*))')
        .eq('gym_id', gym.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;

      // Get latest membership per member
      const membersWithLatest = (data as any[] ?? []).map(m => {
        const memberships = (m.latest_membership as any[]) ?? [];
        if (memberships.length === 0) return { ...m, latest_membership: undefined };
        const latest = memberships.reduce((newest, cur) =>
          new Date(cur.created_at) > new Date(newest.created_at) ? cur : newest
        );
        return { ...m, latest_membership: latest };
      });

      setMembers(membersWithLatest);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gym]);

  const filteredMembers = useMemo(() => {
    let result = members;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) || m.phone.includes(q)
      );
    }

    switch (filter) {
      case 'active':
        result = result.filter(m => m.is_active && m.latest_membership && getMembershipStatus(m.latest_membership.expiry_date, true) === 'active');
        break;
      case 'expiring_soon':
        result = result.filter(m => m.is_active && m.latest_membership && getMembershipStatus(m.latest_membership.expiry_date, true) === 'expiring_soon');
        break;
      case 'expiring_tomorrow':
        result = result.filter(m => m.is_active && m.latest_membership && daysUntilExpiry(m.latest_membership.expiry_date) === 1);
        break;
      case 'expired':
        result = result.filter(m => m.is_active && m.latest_membership && getMembershipStatus(m.latest_membership.expiry_date, true) === 'expired');
        break;
      case 'pending':
        result = result.filter(m => m.is_active && m.latest_membership && getMembershipStatus(m.latest_membership.expiry_date, true) === 'expired');
        break;
      case 'inactive':
        result = result.filter(m => !m.is_active);
        break;
      case 'gym':
        result = result.filter(m => m.membership_type === 'gym');
        break;
      case 'boxing':
        result = result.filter(m => m.membership_type === 'boxing');
        break;
      case 'gym_boxing':
        result = result.filter(m => m.membership_type === 'gym_boxing');
        break;
    }

    return result;
  }, [members, debouncedSearch, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE));
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * MEMBERS_PER_PAGE;
    return filteredMembers.slice(start, start + MEMBERS_PER_PAGE);
  }, [filteredMembers, currentPage]);
  const paginationItems = useMemo(() => getPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  // Return to the first page whenever the visible result set changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filter]);

  // Keep the current page valid after deleting or clearing members.
  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const filters: { key: MembersFilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'expiring_tomorrow', label: 'Expiring Tomorrow' },
    { key: 'expiring_soon', label: 'Expiring Soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'gym', label: 'Gym' },
    { key: 'boxing', label: 'Boxing' },
    { key: 'gym_boxing', label: 'Gym + Boxing' },
  ];

  const selectedFilterLabel = filters.find(item => item.key === filter)?.label ?? 'All';
  const visibleMemberCountLabel = filter === 'all'
    ? `${filteredMembers.length} ${debouncedSearch ? 'matching ' : 'total '}member${filteredMembers.length === 1 ? '' : 's'}`
    : `${filteredMembers.length} ${selectedFilterLabel.toLowerCase()} member${filteredMembers.length === 1 ? '' : 's'}`;

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto overflow-x-hidden px-4 pb-4 pt-7 md:p-8">
      <div className="mb-6 flex min-w-0 items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">MEMBERS</h1>
          <p className="text-ink-500 mt-1">{visibleMemberCountLabel}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end">
          <button onClick={onAddMember} className="btn-primary h-11 min-w-0 shrink-0 px-4 text-sm sm:px-5 sm:text-base">
            <Plus className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
            <span className="whitespace-nowrap">Add Member</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-11"
          placeholder="Search by name or phone..."
        />
      </div>

      {/* Filters */}
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto scrollbar-hide mb-6 pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.key ? 'bg-brand-yellow text-brand-pure' : 'bg-white text-ink-700 border border-ink-200 hover:border-ink-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading members...</div>
      ) : filteredMembers.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-ink-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-ink-400" />
          </div>
          <h3 className="font-display text-2xl tracking-wide mb-2">NO MEMBERS YET</h3>
          <p className="text-ink-500 mb-4">Add your first member and start tracking renewals.</p>
          <button onClick={onAddMember} className="btn-primary mx-auto">
            <Plus className="w-5 h-5" /> ADD MEMBER
          </button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {paginatedMembers.map(m => (
              <MemberCard key={m.id} member={m} onView={() => onViewMember(m.id)} onDelete={() => deleteMember(m)} deleting={deletingId === m.id} />
            ))}
          </div>

          {/* Desktop member cards */}
          <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
            {paginatedMembers.map(m => (
              <DesktopMemberCard key={m.id} member={m} onView={() => onViewMember(m.id)} onDelete={() => deleteMember(m)} deleting={deletingId === m.id} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="mt-5 flex w-full items-center justify-center gap-1 sm:gap-2" aria-label="Members pagination">
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-200 disabled:pointer-events-none disabled:text-ink-300 sm:h-10 sm:w-10"
                aria-label="Previous members page"
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
                  aria-label={`Go to members page ${item}`}
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
                aria-label="Next members page"
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

function MemberCard({ member, onView, onDelete, deleting }: { member: MemberWithMembership; onView: () => void; onDelete: () => void; deleting: boolean }) {
  const status = member.latest_membership ? getMembershipStatus(member.latest_membership.expiry_date, member.is_active) : 'inactive';
  const plan = member.latest_membership?.plan;
  return (
    <div onClick={onView} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onView(); }} className="card flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:border-ink-400">
      <MemberPhoto url={member.photo_url} name={member.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{member.name}</p>
          <MembershipStatusBadge status={status} />
        </div>
        <p className="flex items-center gap-1 text-sm text-ink-500"><Phone className="h-3 w-3" />{member.phone}</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {getMembershipTypeLabel(member.membership_type)} • {plan?.name ?? 'No plan'}
          {plan && ` • ${formatCurrency(plan.price)}`}
        </p>
        {member.latest_membership && <p className="mt-0.5 text-xs text-ink-400">{getDaysRemainingText(member.latest_membership.expiry_date, member.is_active)} • {formatDate(member.latest_membership.expiry_date)}</p>}
      </div>
      <button aria-label={`Delete ${member.name}`} disabled={deleting} onClick={event => { event.stopPropagation(); onDelete(); }} className="rounded-lg p-2 text-status-danger hover:bg-status-danger-bg disabled:opacity-50">
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}

function DesktopMemberCard({ member, onView, onDelete, deleting }: { member: MemberWithMembership; onView: () => void; onDelete: () => void; deleting: boolean }) {
  const status = member.latest_membership ? getMembershipStatus(member.latest_membership.expiry_date, member.is_active) : 'inactive';
  const plan = member.latest_membership?.plan;
  return (
    <article onClick={onView} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onView(); }} className="card group relative w-full cursor-pointer overflow-hidden text-left transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow">
      <div className={`h-1.5 w-full ${status === 'active' ? 'bg-status-active' : status === 'expired' ? 'bg-status-danger' : status === 'inactive' ? 'bg-ink-300' : 'bg-status-warning'}`} />
      <div className="flex gap-4 p-4 md:min-h-[190px] md:p-5">
        <div className="shrink-0 pt-1">
          <MemberPhoto url={member.photo_url} name={member.name} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink-900">{member.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500"><Phone className="h-3.5 w-3.5" />{member.phone}</p>
            </div>
            <MembershipStatusBadge status={status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs text-ink-500">Membership</dt><dd className="mt-0.5 font-medium">{getMembershipTypeLabel(member.membership_type)}</dd></div>
            <div><dt className="text-xs text-ink-500">Plan</dt><dd className="mt-0.5 truncate font-medium">{plan?.name ?? 'No plan'}</dd></div>
            <div><dt className="text-xs text-ink-500">Amount</dt><dd className="mt-0.5 font-medium">{plan ? formatCurrency(plan.price) : '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Expiry</dt><dd className="mt-0.5 font-medium">{member.latest_membership ? formatDate(member.latest_membership.expiry_date) : '—'}</dd></div>
          </dl>
          {member.latest_membership && <p className="mt-3 text-xs text-ink-500">{getDaysRemainingText(member.latest_membership.expiry_date, member.is_active)}</p>}
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-ink-200 px-4 py-2.5 md:px-5">
        <span className="text-sm font-semibold text-ink-700">View profile <span aria-hidden="true">→</span></span>
        <button aria-label={`Delete ${member.name}`} disabled={deleting} onClick={event => { event.stopPropagation(); onDelete(); }} className="rounded-lg p-2 text-status-danger hover:bg-status-danger-bg disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </footer>
    </article>
  );
}
