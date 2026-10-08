export type Role = 'super_admin' | 'owner' | 'staff' | 'member';
export interface Account {
    id: string;
    name: string;
    mobile: string;
    role: Role;
    gymId: string;
    memberId?: string;
    active: boolean;
}
export interface Client {
    id: string;
    name: string;
    owner: string;
    mobile: string;
    subscription: string;
    expiry: string;
    fee: number;
    paid: number;
}
export interface Plan {
    id: string;
    name: string;
    fee: number;
    months: number;
    gymId: string;
}
export interface Member {
    id: string;
    gymId: string;
    name: string;
    mobile: string;
    birthday: string;
}
export interface Membership {
    id: string;
    memberId: string;
    planId: string;
    start: string;
    expiry: string;
    fee: number;
    created: string;
    renewal: boolean;
}
export interface Payment {
    id: string;
    memberId: string;
    membershipId: string;
    amount: number;
    date: string;
    method: string;
}
export interface Attendance {
    id: string;
    memberId: string;
    date: string;
    in: string;
    out: string | null;
}
export interface Expense {
    id: string;
    gymId: string;
    title: string;
    amount: number;
    date: string;
}
export interface Reminder {
    id: string;
    memberId: string;
    kind: string;
    date: string;
}
export interface State {
    accounts: Account[];
    clients: Client[];
    plans: Plan[];
    members: Member[];
    memberships: Membership[];
    payments: Payment[];
    attendance: Attendance[];
    expenses: Expense[];
    reminders: Reminder[];
}
export const STORE_KEY = 'gympay-workflow-v2';
export const SESSION_KEY = 'gympay-demo-account';
export function id() { if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID(); return Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join(''); }
export const DEMO_OTP = '123456';
export const roleNames: Record<Role, string> = { super_admin: 'Super Admin', owner: 'Gym Owner', staff: 'Gym Staff', member: 'Member' };
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function days(date: string, reference = today()) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(reference + 'T00:00:00Z')) / 86400000); }
export function expiry(start: string, months: number) {
    const [y, m, d] = start.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    target.setUTCDate(target.getUTCDate() - 1);
    return target.toISOString().slice(0, 10);
}
export function shift(date: string, amount: number) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
export function money(value: number) { return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value); }
export function dateLabel(value: string) { return new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
export function normalizeMobile(value: string) { return value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''); }
export function latest(state: State, memberId: string) { return state.memberships.filter(m => m.memberId === memberId).reverse().sort((a, b) => b.start.localeCompare(a.start) || b.created.localeCompare(a.created))[0]; }
export function currentMembership(state: State, memberId: string) { return state.memberships.filter(m => m.memberId === memberId && m.start <= today() && m.expiry >= today()).sort((a, b) => b.start.localeCompare(a.start))[0] || latest(state, memberId); }
export function received(state: State, membershipId: string) { return state.payments.filter(p => p.membershipId === membershipId).reduce((s, p) => s + p.amount, 0); }
export function balance(state: State, membership: Membership) { return Math.max(0, membership.fee - received(state, membership.id)); }
export function requireRole(account: Account, roles: Role[]) { if (!account.active || !roles.includes(account.role))
    throw new Error('This action is unavailable for this demo role.'); }
function seed(): State {
    const t = today();
    const gymId = 'local-gym';
    const members: Member[] = ['Arun Kumar', 'Karthik', 'Suresh'].map((name, i) => ({ id: 'demo-member-' + i, gymId, name, mobile: '900000000' + i, birthday: i === 0 ? t.slice(0, 4) + '-10-04' : '' }));
    const memberships: Membership[] = members.map((m, i) => ({ id: 'demo-membership-' + i, memberId: m.id, planId: 'monthly', start: shift(t, -29), expiry: shift(t, [0, 5, 12][i]), fee: [1500, 1200, 1500][i], created: new Date(Date.now() + i).toISOString(), renewal: false }));
    let state: State = { accounts: [{ id: 'super', name: 'Platform Admin', mobile: '9999999999', role: 'super_admin', gymId: '', active: true }, { id: 'owner', name: 'Gym Owner', mobile: '9999999998', role: 'owner', gymId, active: true }, { id: 'staff', name: 'Reception Staff', mobile: '9999999997', role: 'staff', gymId, active: true }, ...members.map(m => ({ id: 'account-' + m.id, name: m.name, mobile: m.mobile, role: 'member' as const, gymId, memberId: m.id, active: true }))], clients: [{ id: gymId, name: 'Gym Pay Fitness', owner: 'Gym Owner', mobile: '9999999998', subscription: 'Professional · Monthly', expiry: shift(t, 20), fee: 2500, paid: 2500 }, { id: 'demo-gym-2', name: 'Iron House', owner: 'Priya', mobile: '9888888888', subscription: 'Starter · Monthly', expiry: shift(t, 4), fee: 1500, paid: 750 }], plans: [{ id: 'monthly', name: 'Monthly', fee: 1500, months: 1, gymId }, { id: 'quarterly', name: 'Quarterly', fee: 4000, months: 3, gymId }, { id: 'annual', name: 'Annual', fee: 14000, months: 12, gymId }], members, memberships, payments: [{ id: 'demo-payment', memberId: members[2].id, membershipId: memberships[2].id, amount: 1500, date: t, method: 'Cash' }], attendance: [], expenses: [], reminders: [] };
    // Preserve the earlier frontend demo's member and payment records on first use.
    try {
        const previous = JSON.parse(localStorage.getItem('gympay-frontend-v1') || 'null');
        if (previous?.members?.length && previous?.plans?.length) {
            state.plans = previous.plans.map((p: {
                id: string;
                name: string;
                price: number;
                duration_value: number;
                duration_unit: string;
            }) => ({ id: p.id, name: p.name, fee: Number(p.price), months: p.duration_unit === 'years' ? p.duration_value * 12 : p.duration_unit === 'months' ? p.duration_value : 1, gymId }));
            state.members = previous.members.map((m: {
                id: string;
                name: string;
                phone: string;
            }) => ({ id: m.id, gymId, name: m.name, mobile: normalizeMobile(m.phone), birthday: '' }));
            state.memberships = (previous.memberships ?? []).map((m: {
                id: string;
                member_id: string;
                plan_id: string;
                start_date: string;
                expiry_date: string;
                created_at: string;
            }) => ({ id: m.id, memberId: m.member_id, planId: m.plan_id, start: m.start_date, expiry: m.expiry_date, fee: state.plans.find(p => p.id === m.plan_id)?.fee ?? 0, created: m.created_at, renewal: false }));
            state.payments = (previous.payments ?? []).filter((p: {
                status: string;
            }) => p.status === 'paid').map((p: {
                id: string;
                member_id: string;
                membership_id: string;
                amount: number;
                payment_date: string;
                payment_method: string;
            }) => ({ id: p.id, memberId: p.member_id, membershipId: p.membership_id, amount: Number(p.amount), date: p.payment_date, method: p.payment_method || 'Cash' }));
            state.accounts = state.accounts.filter(a => a.role !== 'member').concat(state.members.map(m => ({ id: 'account-' + m.id, name: m.name, mobile: m.mobile, role: 'member' as const, gymId, memberId: m.id, active: true })));
        }
    }
    catch { /* Fresh demo if previous data cannot be migrated. */ }
    return state;
}
export function loadState(): State { const saved = localStorage.getItem(STORE_KEY); if (saved)
    return JSON.parse(saved) as State; const state = seed(); localStorage.setItem(STORE_KEY, JSON.stringify(state)); return state; }
export function persist(state: State) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
export function addMember(state: State, account: Account, input: {
    name: string;
    mobile: string;
    birthday: string;
    planId: string;
    fee: number;
    start: string;
    expiry: string;
    payment: string;
    amount: number;
}) {
    requireRole(account, ['owner']);
    const mobile = normalizeMobile(input.mobile);
    const plan = state.plans.find(p => p.id === input.planId && p.gymId === account.gymId);
    if (!input.name.trim() || !/^\d{10}$/.test(mobile) || !plan)
        throw new Error('Enter a name, a valid 10-digit mobile and a plan.');
    if (state.accounts.some(a => a.mobile === mobile))
        throw new Error('This mobile already has a demo account.');
    if (!Number.isFinite(input.fee) || input.fee < 0 || !Number.isFinite(input.amount) || input.amount < 0 || input.amount > input.fee)
        throw new Error('Enter valid fee and received amounts. Received cannot exceed the fee.');
    if (input.birthday && input.birthday > today())
        throw new Error('Birthday cannot be in the future.');
    if (!input.start || !input.expiry || input.expiry < input.start)
        throw new Error('Expiry must be on or after the start date.');
    if (input.payment === 'paid' && input.amount !== input.fee || input.payment === 'pending' && input.amount !== 0 || input.payment === 'partial' && !(input.amount > 0 && input.amount < input.fee))
        throw new Error('Received amount must match Paid, Pending or Partial.');
    const member: Member = { id: id(), gymId: account.gymId, name: input.name.trim(), mobile, birthday: input.birthday };
    const membership: Membership = { id: id(), memberId: member.id, planId: plan.id, start: input.start, expiry: input.expiry, fee: input.fee, created: new Date().toISOString(), renewal: false };
    state.members.push(member);
    state.memberships.push(membership);
    state.accounts.push({ id: id(), name: member.name, mobile, role: 'member', gymId: account.gymId, memberId: member.id, active: true });
    if (input.amount > 0)
        state.payments.push({ id: id(), memberId: member.id, membershipId: membership.id, amount: input.amount, date: today(), method: 'Cash' });
    return member.id;
}
export function recordPayment(state: State, account: Account, membershipId: string, amount: number, method: string) {
    requireRole(account, ['owner', 'staff', 'member']);
    const membership = state.memberships.find(m => m.id === membershipId);
    const member = state.members.find(m => m.id === membership?.memberId);
    if (!membership || !member || member.gymId !== account.gymId || account.role === 'member' && member.id !== account.memberId)
        throw new Error('Member is unavailable for this account.');
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance(state, membership))
        throw new Error('Payment must be positive and cannot exceed the outstanding fee.');
    state.payments.push({ id: id(), memberId: member.id, membershipId, amount, date: today(), method });
}
export function punch(state: State, account: Account, memberId: string) {
    requireRole(account, ['owner', 'member']);
    const member = state.members.find(m => m.id === memberId);
    const membership = currentMembership(state, memberId);
    if (!member || member.gymId !== account.gymId || account.role === 'member' && member.id !== account.memberId)
        throw new Error('Member is unavailable for this account.');
    if (!membership || membership.start > today() || days(membership.expiry) < 0)
        throw new Error('An active membership is required to punch attendance.');
    const previous = state.attendance.find(a => a.memberId === memberId && a.date === today());
    if (previous?.out)
        throw new Error('Attendance is already completed for today.');
    if (previous)
        previous.out = new Date().toISOString();
    else
        state.attendance.push({ id: id(), memberId, date: today(), in: new Date().toISOString(), out: null });
}
export function extend(state: State, account: Account, memberId: string, planId: string, start: string) {
    requireRole(account, ['owner']);
    const member = state.members.find(m => m.id === memberId);
    const plan = state.plans.find(p => p.id === planId && p.gymId === account.gymId);
    const previous = latest(state, memberId);
    if (!member || member.gymId !== account.gymId || !plan || !start)
        throw new Error('Choose a valid member, plan and start date.');
    if (previous && start <= previous.expiry)
        throw new Error('Renewal must begin after the current membership expires.');
    state.memberships.push({ id: id(), memberId, planId, start, expiry: expiry(start, plan.months), fee: plan.fee, created: new Date().toISOString(), renewal: true });
}
export const menus: Record<Role, string[]> = { super_admin: ['Overview', 'Clients', 'Subscriptions', 'Client payments'], owner: ['Dashboard', 'Members', 'Membership plans', 'Attendance', 'Payments', 'Pending dues', 'Expenses', 'Staff', 'Reports', 'Automatic reports'], staff: ['Payments', 'Pending dues'], member: ['My dashboard', 'Membership status', 'Payment history', 'Attendance', 'Make payment'] };
export function visibleMembers(state: State, account: Account) { return state.members.filter(m => m.gymId === account.gymId && (account.role !== 'member' || m.id === account.memberId)); }
export function dues(state: State, account: Account) { const ids = new Set(visibleMembers(state, account).map(m => m.id)); return state.memberships.filter(m => ids.has(m.memberId) && balance(state, m) > 0); }

export function absentMemberships(state: State, account: Account) {
  return visibleMembers(state, account).map(member => currentMembership(state, member.id)).filter((membership): membership is Membership => !!membership && membership.start <= today() && days(membership.expiry) >= 0 && -days(membership.start) >= 7 && !state.attendance.some(a => a.memberId === membership.memberId && -days(a.date) >= 0 && -days(a.date) < 7));
}
