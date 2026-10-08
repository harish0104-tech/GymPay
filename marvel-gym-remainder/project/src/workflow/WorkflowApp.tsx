import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CreditCard, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import * as M from './model';
import './workflow.css';
type Dialog = 'payment' | 'extend' | 'plan' | 'expense' | 'staff' | null;
const icons = [LayoutDashboard, Users, CreditCard];
function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="wf-field"><span>{label}</span>{children}</label>; }
function Badge({ children, tone = 'neutral' }: {
    children: ReactNode;
    tone?: string;
}) { return <span className={'wf-badge ' + tone}>{children}</span>; }
function Empty({ children }: {
    children: ReactNode;
}) { return <p className="wf-empty">{children}</p>; }
function Stat({ label, value }: {
    label: string;
    value: ReactNode;
}) { return <div className="wf-stat"><span>{label}</span><strong>{value}</strong></div>; }
function Table({ head, rows }: {
    head: string[];
    rows: ReactNode[][];
}) { return rows.length ? <div className="wf-table-wrap"><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <Empty>No records yet.</Empty>; }
function Popup({ title, close, children }: {
    title: string;
    close: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); }, []);
    return <dialog ref={ref} className="wf-dialog" aria-label={title} onCancel={close}><div className="wf-panel-heading"><h2>{title}</h2><button type="button" className="wf-icon" aria-label="Close dialog" onClick={close}><X size={20}/></button></div><div className="wf-dialog-content">{children}</div></dialog>;
}
export default function WorkflowApp() {
    const [state, setState] = useState<M.State>(M.loadState);
    const [accountId, setAccountId] = useState(() => sessionStorage.getItem(M.SESSION_KEY) || '');
    const account = state.accounts.find(a => a.id === accountId && a.active);
    const [page, setPage] = useState(() => new URLSearchParams(location.search).get('view') || '');
    const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('member'));
    const [mobile, setMobile] = useState('');
    const [otp, setOtp] = useState('');
    const [challenge, setChallenge] = useState<{
        id: string;
        expires: number;
    } | null>(null);
    const [loginError, setLoginError] = useState('');
    const [notice, setNotice] = useState('');
    const [drawer, setDrawer] = useState(false);
    const [search, setSearch] = useState('');
    const [dialog, setDialog] = useState<Dialog>(null);
    const [target, setTarget] = useState('');
    const [formError, setFormError] = useState('');
    const [draft, setDraft] = useState({ name: '', mobile: '', birthday: '', planId: state.plans[0]?.id || '', fee: String(state.plans[0]?.fee || 0), start: M.today(), expiry: M.expiry(M.today(), state.plans[0]?.months || 1), payment: 'paid', amount: String(state.plans[0]?.fee || 0) });
    const [record, setRecord] = useState({ amount: '', method: 'Cash', planId: '', start: M.today(), name: '', mobile: '', months: '1', date: M.today() });
    const allowed = account ? M.menus[account.role] : [];
    const current = allowed.includes(page) || page === 'Add member' && account?.role === 'owner' ? page : allowed[0];
    useEffect(() => { if (!notice)
        return; const timeout = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timeout); }, [notice]);
    useEffect(() => { const update = () => { try {
        setState(M.loadState());
    }
    catch {
        setNotice('Could not reload saved demo data.');
    } }; window.addEventListener('storage', update); return () => window.removeEventListener('storage', update); }, []);
    function update(action: (next: M.State) => void, message = 'Saved locally.') {
        const next = structuredClone(state);
        try {
            action(next);
            M.persist(next);
            setState(next);
            setNotice(message);
            setFormError('');
            return true;
        }
        catch (error) {
            setFormError(error instanceof Error ? error.message : 'Unable to save.');
            return false;
        }
    }
    useEffect(() => { const back = () => { const route = new URLSearchParams(location.search); setPage(route.get('view') || ''); setSelected(route.get('member')); setDialog(null); setDrawer(false); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
    function viewMember(id: string) { setPage('Members'); setSelected(id); history.pushState({}, '', `/?view=Members&member=${encodeURIComponent(id)}`); }
    function go(next: string) { setPage(next); setSelected(null); setSearch(''); setDrawer(false); setFormError(''); history.pushState({}, '', `/?view=${encodeURIComponent(next)}`); }
    function open(kind: Dialog, memberId = '') { setTarget(memberId); const membership = memberId ? M.latest(state, memberId) : undefined; setRecord({ amount: membership ? String(M.balance(state, membership)) : '', method: 'Cash', planId: membership?.planId || state.plans.find(p => p.gymId === account?.gymId)?.id || '', start: membership && membership.expiry >= M.today() ? M.shift(membership.expiry, 1) : M.today(), name: '', mobile: '', months: '1', date: M.today() }); setFormError(''); setDialog(kind); }
    function openPayment(membershipId: string) { const m = state.memberships.find(m => m.id === membershipId); if (m) {
        open('payment', m.memberId);
        setTarget(membershipId);
        setRecord(r => ({ ...r, amount: String(M.balance(state, m)) }));
    } }
    function requestOtp(e: FormEvent) { e.preventDefault(); const found = state.accounts.find(a => a.mobile === M.normalizeMobile(mobile) && a.active); if (!found) {
        setLoginError('No active demo account for this mobile. Choose one below.');
        return;
    } setChallenge({ id: found.id, expires: Date.now() + 5 * 60000 }); setOtp(''); setLoginError(''); }
    function verify(e: FormEvent) { e.preventDefault(); if (!challenge || challenge.expires < Date.now()) {
        setLoginError('Demo code expired. Request a new code.');
        setChallenge(null);
        return;
    } if (otp !== M.DEMO_OTP) {
        setLoginError('Use demo code 123456. No SMS is sent.');
        return;
    } const found = state.accounts.find(a => a.id === challenge.id && a.active); if (!found) {
        setLoginError('This demo account is inactive.');
        return;
    } sessionStorage.setItem(M.SESSION_KEY, found.id); setAccountId(found.id); setPage(M.menus[found.role][0]); setChallenge(null); setOtp(''); }
    if (!account)
        return <div className="wf wf-login"><div className="wf-login-intro"><img src="/gym-pay-logo.svg" alt="Gym Pay"/><Badge tone="yellow">ONE GYM. ONE WORKFLOW.</Badge><h1>Less admin.<br />More momentum.</h1><p>Members, collections and attendance — together in one place.</p><div className="wf-login-roles">Owner · Staff · Member · Super Admin</div></div><main className="wf-login-main"><div className="wf-login-card"><ShieldCheck size={30}/><h2>{challenge ? 'Enter your code' : 'Welcome to Gym Pay'}</h2><p>{challenge ? 'Verify your demo mobile to continue.' : 'Enter your mobile. Your account determines your dashboard.'}</p><div className="wf-demo-note"><strong>Frontend demo</strong><br />No SMS or authentication server. Demo OTP: <b>123456</b>. Roles and data are simulated on this device.</div><form onSubmit={challenge ? verify : requestOtp}><Field label="Mobile number"><div className="wf-phone"><span>+91</span><input required type="tel" inputMode="tel" autoComplete="tel-national" disabled={!!challenge} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit mobile"/></div></Field>{challenge && <Field label="Demo OTP"><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456"/></Field>}{loginError && <p role="alert" className="wf-error">{loginError}</p>}<button className="wf-primary wf-full">{challenge ? 'VERIFY & CONTINUE' : 'GET DEMO OTP'}<ArrowRight size={18}/></button>{challenge && <button type="button" className="wf-link" onClick={() => { setChallenge(null); setLoginError(''); }}>Change mobile / request again</button>}</form><details open><summary>Try a demo account</summary><div className="wf-demo-accounts">{state.accounts.filter(a => a.active).slice(0, 8).map(a => <button key={a.id} onClick={() => { setMobile(a.mobile); setChallenge(null); setLoginError(''); }}><span>{M.roleNames[a.role]}<small>{a.name}</small></span><b>{a.mobile}</b></button>)}</div></details></div></main></div>;
    const members = M.visibleMembers(state, account);
    const memberIds = new Set(members.map(m => m.id));
    const memberships = state.memberships.filter(m => memberIds.has(m.memberId));
    const payments = state.payments.filter(p => memberIds.has(p.memberId));
    const attendance = state.attendance.filter(a => memberIds.has(a.memberId));
    const expenses = state.expenses.filter(e => e.gymId === account.gymId);
    const plans = state.plans.filter(p => p.gymId === account.gymId);
    const due = M.dues(state, account);
    const member = members.find(m => m.id === (account.role === 'member' ? account.memberId : selected));
    const membership = member ? M.currentMembership(state, member.id) : undefined;
    const plan = plans.find(p => p.id === membership?.planId);
    const t = M.today();
    const monthly = payments.filter(p => p.date.startsWith(t.slice(0, 7))).reduce((s, p) => s + p.amount, 0);
    const collection = payments.filter(p => p.date === t).reduce((s, p) => s + p.amount, 0);
    const totalDue = due.reduce((s, m) => s + M.balance(state, m), 0);
    const currentMemberships = members.map(m => M.currentMembership(state, m.id)).filter((m): m is M.Membership => !!m);
    const active = currentMemberships.filter(m => m.start <= t && M.days(m.expiry) >= 0);
    const expiring = active.filter(m => M.days(m.expiry) <= 7);
    const absent = M.absentMemberships(state, account);
    const memberName = (id: string) => members.find(m => m.id === id)?.name || 'Member';
    function queue(ids: string[], kind: string) { update(next => { M.requireRole(account!, ['owner']); for (const id of ids) {
        if (!memberIds.has(id))
            throw new Error('Member unavailable.');
        if (!next.reminders.some(r => r.memberId === id && r.kind === kind && r.date === t))
            next.reminders.push({ id: M.id(), memberId: id, kind, date: t });
    } }, 'Reminders saved locally. No external messages were sent.'); }
    function whatsapp(m: M.Member) { const message = `Hello ${m.name}, a reminder from Gym Pay about your gym membership${membership ? ` ending ${M.dateLabel(membership.expiry)}` : ''}.`; window.open(`https://wa.me/91${m.mobile}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer'); }
    function saveMember(e: FormEvent) { e.preventDefault(); let id = ''; if (update(next => { id = M.addMember(next, account!, { ...draft, fee: Number(draft.fee), amount: Number(draft.amount) }); }, 'Member saved. A local member demo login is ready.')) {
        viewMember(id);
    } }
    function beginAdd() { const p = plans[0]; setDraft({ name: '', mobile: '', birthday: '', planId: p?.id || '', fee: String(p?.fee || 0), start: t, expiry: M.expiry(t, p?.months || 1), payment: 'paid', amount: String(p?.fee || 0) }); go('Add member'); }
    function saveDialog(e: FormEvent) {
        e.preventDefault();
        const ok = update(next => {
            if (dialog === 'payment')
                M.recordPayment(next, account!, target, Number(record.amount), account!.role === 'member' ? 'Demo payment' : record.method);
            if (dialog === 'extend')
                M.extend(next, account!, target, record.planId, record.start);
            if (dialog === 'plan') {
                M.requireRole(account!, ['owner']);
                if (!record.name.trim() || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0 || !Number.isInteger(Number(record.months)) || Number(record.months) < 1)
                    throw new Error('Enter a plan name, valid fee and whole months.');
                next.plans.push({ id: M.id(), gymId: account!.gymId, name: record.name.trim(), fee: Number(record.amount), months: Number(record.months) });
            }
            if (dialog === 'expense') {
                M.requireRole(account!, ['owner']);
                if (!record.name.trim() || !Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0 || record.date > t)
                    throw new Error('Enter an expense, positive amount and date no later than today.');
                next.expenses.push({ id: M.id(), gymId: account!.gymId, title: record.name.trim(), amount: Number(record.amount), date: record.date });
            }
            if (dialog === 'staff') {
                M.requireRole(account!, ['owner']);
                const mobile = M.normalizeMobile(record.mobile);
                if (!record.name.trim() || !/^\d{10}$/.test(mobile) || next.accounts.some(a => a.mobile === mobile))
                    throw new Error('Enter a name and a unique 10-digit mobile.');
                next.accounts.push({ id: M.id(), gymId: account!.gymId, name: record.name.trim(), mobile, role: 'staff', active: true });
            }
        }, dialog === 'payment' && account!.role === 'member' ? 'Demo payment recorded. No money was transferred.' : 'Saved locally.');
        if (ok)
            setDialog(null);
    }
    function paymentTable(rows: M.Payment[]) { return <Table head={account!.role === 'member' ? ['Date', 'Amount', 'Method', 'Status'] : ['Member', 'Date', 'Amount', 'Method', 'Status']} rows={[...rows].sort((a, b) => b.date.localeCompare(a.date)).map(p => [...(account!.role === 'member' ? [] : [memberName(p.memberId)]), M.dateLabel(p.date), M.money(p.amount), p.method, <Badge tone="green">Paid</Badge>])}/>; }
    function duesTable() { return <Table head={['Member', 'Membership', 'Fee', 'Received', 'Due', 'Action']} rows={due.map(m => [memberName(m.memberId), `${M.dateLabel(m.start)} – ${M.dateLabel(m.expiry)}`, M.money(m.fee), M.money(M.received(state, m.id)), M.money(M.balance(state, m)), <button className="wf-small" onClick={() => openPayment(m.id)}>{account!.role === 'member' ? 'Demo pay' : 'Record payment'}</button>])}/>; }
    function profile() {
        if (!member)
            return <Empty>Select a member.</Empty>;
        const paid = membership ? M.received(state, membership.id) : 0;
        return <><div className="wf-profile-header"><div className="wf-avatar">{member.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div><h2>{member.name.toUpperCase()}</h2><a href={'tel:+91' + member.mobile}>📱 {member.mobile}</a></div></div><div className="wf-info-grid">{[['Membership', plan?.name || 'No plan'], ['Start', membership ? M.dateLabel(membership.start) : '—'], ['Expiry', membership ? M.dateLabel(membership.expiry) : '—'], ['Fee', M.money(membership?.fee || 0)], ['Paid', M.money(paid)], ['Outstanding', M.money(membership ? M.balance(state, membership) : 0)], ['Status', <Badge tone={!membership || M.days(membership.expiry) < 0 ? 'red' : membership.start > t ? 'yellow' : 'green'}>{!membership ? 'NO MEMBERSHIP' : M.days(membership.expiry) < 0 ? 'EXPIRED' : membership.start > t ? 'UPCOMING' : '● ACTIVE'}</Badge>]].map(([label, value], i) => <div key={i}><span>{label}</span><strong>{value}</strong></div>)}</div><section className="wf-panel"><div className="wf-panel-heading"><h2>PAYMENT HISTORY</h2></div>{paymentTable(payments.filter(p => p.memberId === member.id))}</section><div className="wf-actions">{account!.role === 'owner' && <><button onClick={() => whatsapp(member)} className="wf-secondary">SEND WHATSAPP</button><button onClick={() => open('extend', member.id)} className="wf-secondary">EXTEND MEMBERSHIP</button></>}{account!.role !== 'super_admin' && <button disabled={!due.some(m => m.memberId === member.id)} onClick={() => { const unpaid = due.find(m => m.memberId === member.id); if (unpaid)
            openPayment(unpaid.id); }} className="wf-primary">{account!.role === 'member' ? 'MAKE DEMO PAYMENT' : 'RECORD PAYMENT'}</button>}</div><p className="wf-subtle">Payments settle the selected period. Extending creates a separate renewal and fee.</p></>;
    }
    function attendancePanel() { return <><p className="wf-subtle">One check-in and check-out per day, using India time. An active membership is required.</p>{account!.role === 'owner' && <form className="wf-inline-form" onSubmit={e => { e.preventDefault(); if (target)
        update(next => M.punch(next, account!, target), 'Attendance saved locally.'); }}><select required aria-label="Member" value={target} onChange={e => setTarget(e.target.value)}><option value="">Select member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="wf-primary">PUNCH IN / OUT</button></form>}{account!.role === 'member' && <button className="wf-primary" disabled={!!attendance.find(a => a.date === t)?.out} onClick={() => update(next => M.punch(next, account!, account!.memberId!), 'Attendance saved locally.')}>{attendance.find(a => a.date === t)?.out ? 'TODAY COMPLETED' : attendance.some(a => a.date === t) ? 'PUNCH OUT' : 'PUNCH IN'}</button>}<Table head={['Member', 'Date', 'In', 'Out']} rows={[...attendance].reverse().map(a => [memberName(a.memberId), M.dateLabel(a.date), new Date(a.in).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }), a.out ? new Date(a.out).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—'])}/></>; }
    function content() {
        if (selected && account!.role === 'owner')
            return profile();
        if (current === 'Add member')
            return <form className="wf-member-form wf-panel" onSubmit={saveMember}><div className="wf-form-grid"><Field label="Name"><input required autoComplete="name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field><Field label="Mobile"><input required type="tel" inputMode="tel" value={draft.mobile} onChange={e => setDraft({ ...draft, mobile: e.target.value })}/></Field><Field label="Plan"><select required value={draft.planId} onChange={e => { const p = plans.find(p => p.id === e.target.value)!; setDraft({ ...draft, planId: p.id, fee: String(p.fee), amount: draft.payment === 'paid' ? String(p.fee) : draft.payment === 'pending' ? '0' : draft.amount, expiry: M.expiry(draft.start, p.months) }); }}>{plans.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field><Field label="Membership Fee (₹)"><input required type="number" min="0" step="0.01" value={draft.fee} onChange={e => setDraft({ ...draft, fee: e.target.value, amount: draft.payment === 'paid' ? e.target.value : draft.amount })}/></Field><Field label="Start Date"><input required type="date" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value, expiry: e.target.value ? M.expiry(e.target.value, plans.find(p => p.id === draft.planId)?.months || 1) : '' })}/></Field><Field label="Expiry Date"><input required type="date" min={draft.start} value={draft.expiry} onChange={e => setDraft({ ...draft, expiry: e.target.value })}/></Field><fieldset className="wf-radio"><legend>Payment</legend>{['paid', 'pending', 'partial'].map(value => <label key={value}><input type="radio" name="payment" value={value} checked={draft.payment === value} onChange={() => setDraft({ ...draft, payment: value, amount: value === 'paid' ? draft.fee : value === 'pending' ? '0' : '' })}/>{value[0].toUpperCase() + value.slice(1)}</label>)}</fieldset><Field label="Amount Received (₹)"><input required type="number" min="0" max={draft.fee} step="0.01" readOnly={draft.payment !== 'partial'} value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })}/></Field><Field label="Birthday (optional)"><input type="date" max={t} value={draft.birthday} onChange={e => setDraft({ ...draft, birthday: e.target.value })}/></Field></div><p className="wf-subtle">Outstanding: {M.money(Math.max(0, Number(draft.fee) - Number(draft.amount)))} · Monthly expiry is the day before the next membership period.</p>{formError && <p className="wf-error" role="alert">{formError}</p>}<button className="wf-primary wf-full">SAVE MEMBER</button></form>;
        if (account!.role === 'super_admin') {
            const clients = state.clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
            const heads = current === 'Clients' ? ['Gym', 'Owner', 'Mobile', 'Subscription'] : current === 'Subscriptions' ? ['Gym', 'Subscription', 'Expiry', 'Days remaining', 'Status'] : current === 'Client payments' ? ['Gym', 'Subscription fee', 'Received', 'Outstanding', 'Payment status'] : ['Gym', 'Owner', 'Subscription', 'Expiry', 'Fee', 'Paid', 'Due'];
            const rows = clients.map(c => current === 'Clients' ? [c.name, c.owner, c.mobile, c.subscription] : current === 'Subscriptions' ? [c.name, c.subscription, M.dateLabel(c.expiry), Math.max(0, M.days(c.expiry)), <Badge tone={M.days(c.expiry) < 0 ? 'red' : M.days(c.expiry) <= 7 ? 'yellow' : 'green'}>{M.days(c.expiry) < 0 ? 'Expired' : M.days(c.expiry) <= 7 ? 'Expiring soon' : 'Active'}</Badge>] : current === 'Client payments' ? [c.name, M.money(c.fee), M.money(c.paid), M.money(Math.max(0, c.fee - c.paid)), <Badge tone={c.paid >= c.fee ? 'green' : 'yellow'}>{c.paid >= c.fee ? 'Paid' : c.paid > 0 ? 'Partial' : 'Pending'}</Badge>] : [c.name, c.owner, c.subscription, M.dateLabel(c.expiry), M.money(c.fee), M.money(c.paid), M.money(Math.max(0, c.fee - c.paid))]);
            return <><div className="wf-stats"><Stat label="Gym clients" value={state.clients.length}/><Stat label="Subscriptions expiring in 7 days" value={state.clients.filter(c => M.days(c.expiry) >= 0 && M.days(c.expiry) <= 7).length}/><Stat label="Subscription fees" value={M.money(state.clients.reduce((s, c) => s + c.fee, 0))}/><Stat label="Outstanding" value={M.money(state.clients.reduce((s, c) => s + Math.max(0, c.fee - c.paid), 0))}/></div><p className="wf-subtle">Platform subscription demo records, separate from gym member payments.</p><div className="wf-search"><Search size={18}/><input aria-label="Search clients" placeholder="Search gyms" value={search} onChange={e => setSearch(e.target.value)}/></div><section className="wf-panel"><Table head={heads} rows={rows}/></section></>;
        }
        if (current === 'Dashboard')
            return <><div className="wf-stats"><Stat label="Members" value={members.length}/><Stat label="Active" value={active.length}/><Stat label="Expiring in 7 Days" value={expiring.length}/><Stat label="Payment Due" value={M.money(totalDue)}/><Stat label="Today's Collection" value={M.money(collection)}/></div><button className="wf-primary wf-full wf-add" onClick={beginAdd}><Plus size={20}/> ADD MEMBER</button><section className="wf-panel"><div className="wf-panel-heading"><h2>PAYMENT DUE TODAY</h2></div>{due.filter(m => m.start <= t).length ? due.filter(m => m.start <= t).map(m => <div key={m.id} className="wf-due-row"><button className="wf-link" onClick={() => { viewMember(m.memberId); }}>{memberName(m.memberId)}</button><strong>{M.money(M.balance(state, m))}</strong><button className="wf-small" onClick={() => queue([m.memberId], 'Payment reminder')}>REMIND</button><button className="wf-small green" onClick={() => openPayment(m.id)}>PAID</button></div>) : <Empty>All clear. No payments due today.</Empty>}</section><section className="wf-panel"><div className="wf-panel-heading"><h2>EXPIRING SOON</h2><span>Next 7 days</span></div><div className="wf-due-row"><strong>{expiring.length} members</strong><button disabled={!expiring.length} className="wf-small" onClick={() => queue(expiring.map(m => m.memberId), 'Membership expiry reminder')}>SEND ALL</button></div></section><div className="wf-stats"><Stat label="New members this month" value={members.filter(m => { const first = memberships.filter(s => s.memberId === m.id).sort((a, b) => a.created.localeCompare(b.created))[0]; return first?.start.startsWith(t.slice(0, 7)); }).length}/><Stat label="Renewals this month" value={memberships.filter(m => m.renewal && m.start.startsWith(t.slice(0, 7))).length}/><Stat label="Absent 7+ days" value={absent.length}/><Stat label="Monthly revenue" value={M.money(monthly)}/></div></>;
        if (current === 'Members')
            return <><div className="wf-toolbar"><div className="wf-search"><Search size={18}/><input aria-label="Search members" placeholder="Search name or mobile" value={search} onChange={e => setSearch(e.target.value)}/></div><button className="wf-primary" onClick={beginAdd}><Plus size={18}/>Add member</button></div><section className="wf-panel"><Table head={['Member', 'Mobile', 'Plan', 'Expiry', 'Due', 'Profile']} rows={members.filter(m => (m.name + ' ' + m.mobile).toLowerCase().includes(search.toLowerCase())).map(m => { const membership = M.latest(state, m.id); return [m.name, m.mobile, plans.find(p => p.id === membership?.planId)?.name || '—', membership ? M.dateLabel(membership.expiry) : '—', M.money(due.filter(s => s.memberId === m.id).reduce((sum, s) => sum + M.balance(state, s), 0)), <button className="wf-small" onClick={() => viewMember(m.id)}>View <ArrowRight size={14}/></button>]; })}/></section></>;
        if (current === 'Membership plans')
            return <><button className="wf-primary" onClick={() => open('plan')}><Plus size={18}/>Add plan</button><div className="wf-plan-grid">{plans.map(p => <article className="wf-panel wf-plan" key={p.id}><Badge tone="yellow">{p.months} {p.months === 1 ? 'month' : 'months'}</Badge><h2>{p.name}</h2><strong>{M.money(p.fee)}</strong><p>Membership fee · per period</p></article>)}</div></>;
        if (current === 'Payments' || current === 'Payment history')
            return <>{account!.role !== 'member' && <><div className="wf-stats"><Stat label="Today's collection" value={M.money(collection)}/><Stat label="Pending dues" value={M.money(totalDue)}/><Stat label="Monthly revenue" value={M.money(monthly)}/></div><section className="wf-panel"><div className="wf-panel-heading"><h2>RECORD A PAYMENT</h2></div>{duesTable()}</section></>}<section className="wf-panel"><div className="wf-panel-heading"><h2>PAYMENT HISTORY</h2></div>{paymentTable(payments)}</section></>;
        if (current === 'Pending dues' || current === 'Make payment')
            return <><p className="wf-subtle">{account!.role === 'member' ? 'Demo checkout records a local payment only. No gateway is connected and no money is transferred.' : 'Remaining balances include partially paid memberships and earlier unpaid periods.'}</p><section className="wf-panel">{duesTable()}</section></>;
        if (current === 'Attendance')
            return attendancePanel();
        if (current === 'Expenses')
            return <><button className="wf-primary" onClick={() => open('expense')}><Plus size={18}/>Add expense</button><section className="wf-panel"><Table head={['Expense', 'Date', 'Amount']} rows={[...expenses].reverse().map(e => [e.title, M.dateLabel(e.date), M.money(e.amount)])}/></section></>;
        if (current === 'Staff')
            return <><button className="wf-primary" onClick={() => open('staff')}><Plus size={18}/>Add staff login</button><p className="wf-subtle">Staff can view and record gym payments. Member management, attendance, expenses and reports are owner-only.</p><section className="wf-panel"><Table head={['Name', 'Mobile', 'Access', 'Status', 'Action']} rows={state.accounts.filter(a => a.role === 'staff' && a.gymId === account!.gymId).map(a => [a.name, a.mobile, 'Payments only', <Badge tone={a.active ? 'green' : 'red'}>{a.active ? 'Active' : 'Disabled'}</Badge>, <button className="wf-small" onClick={() => update(next => { M.requireRole(account!, ['owner']); const staff = next.accounts.find(s => s.id === a.id)!; staff.active = !staff.active; })}>{a.active ? 'Disable' : 'Enable'}</button>])}/></section></>;
        if (current === 'My dashboard')
            return <><div className="wf-stats"><Stat label="Membership" value={membership && membership.start <= t && M.days(membership.expiry) >= 0 ? 'Active' : 'Inactive'}/><Stat label="Expiry date" value={membership ? M.dateLabel(membership.expiry) : '—'}/><Stat label="Outstanding" value={M.money(totalDue)}/></div><div className="wf-actions"><button className="wf-primary" onClick={() => go('Attendance')}>PUNCH ATTENDANCE</button><button className="wf-secondary" onClick={() => go('Make payment')}>MAKE DEMO PAYMENT</button></div>{profile()}</>;
        if (current === 'Membership status')
            return profile();
        if (current === 'Reports')
            return <><div className="wf-stats"><Stat label="Today's collection" value={M.money(collection)}/><Stat label="Monthly revenue" value={M.money(monthly)}/><Stat label="Monthly expenses" value={M.money(expenses.filter(e => e.date.startsWith(t.slice(0, 7))).reduce((s, e) => s + e.amount, 0))}/><Stat label="Monthly net collection" value={M.money(monthly - expenses.filter(e => e.date.startsWith(t.slice(0, 7))).reduce((s, e) => s + e.amount, 0))}/></div><section className="wf-panel"><div className="wf-panel-heading"><h2>DAILY COLLECTION REPORT</h2><button className="wf-small" onClick={() => { const dates = [...new Set(payments.map(p => p.date))].sort(); const csv = 'Date,Collection\n' + dates.map(d => `${d},${payments.filter(p => p.date === d).reduce((s, p) => s + p.amount, 0)}`).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'gym-pay-daily-collections.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export CSV</button></div><Table head={['Date', 'Payments', 'Collection']} rows={[...new Set(payments.map(p => p.date))].sort().reverse().map(d => [M.dateLabel(d), payments.filter(p => p.date === d).length, M.money(payments.filter(p => p.date === d).reduce((s, p) => s + p.amount, 0))])}/></section></>;
        if (current === 'Automatic reports') {
            const groups = [{ name: 'Membership expiry reminder', ids: expiring.map(m => m.memberId), description: 'Active memberships ending in the next 7 days.' }, { name: 'Payment reminder', ids: [...new Set(due.map(m => m.memberId))], description: 'Members with any outstanding membership fee.' }, { name: 'Renewal reminder', ids: currentMemberships.filter(m => M.days(m.expiry) < 0).map(m => m.memberId), description: 'Expired memberships ready for renewal.' }, { name: 'Birthday message', ids: members.filter(m => m.birthday.slice(5) === t.slice(5)).map(m => m.id), description: 'Members whose birthday is today.' }, { name: 'Absentee alert', ids: absent.map(m => m.memberId), description: 'Active members with no check-in in the last 7 days.' }];
            return <><p className="wf-subtle">Calculated when you open this page. Queue reminders locally; background scheduling and message delivery are unavailable in this demo.</p><div className="wf-plan-grid">{groups.map(g => <section key={g.name} className="wf-panel wf-plan"><h2>{g.name}</h2><p>{g.description}</p><strong>{g.ids.length} members</strong><p>{g.ids.slice(0, 4).map(memberName).join(', ')}{g.ids.length > 4 ? '…' : ''}</p><div className="wf-actions"><button disabled={!g.ids.length} className="wf-small" onClick={() => queue(g.ids, g.name)}>Queue locally</button></div></section>)}<section className="wf-panel wf-plan"><h2>Daily collection report</h2><p>Today's received payments.</p><strong>{M.money(collection)}</strong><button className="wf-small" onClick={() => go('Reports')}>View report</button></section></div><section className="wf-panel"><div className="wf-panel-heading"><h2>LOCAL REMINDER QUEUE</h2></div><Table head={['Member', 'Reminder', 'Date', 'Status']} rows={state.reminders.filter(r => memberIds.has(r.memberId)).map(r => [memberName(r.memberId), r.kind, M.dateLabel(r.date), <Badge tone="yellow">Queued locally</Badge>])}/></section></>;
        }
        return <Empty>Select a menu item.</Empty>;
    }
    return <div className="wf wf-app"><aside className={'wf-sidebar ' + (drawer ? 'is-open' : '')}><div className="wf-brand"><img src="/gym-pay-logo.svg" alt="Gym Pay"/><button className="wf-icon wf-mobile" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={20}/></button></div><p className="wf-nav-caption">{account.role === 'super_admin' ? 'PLATFORM PANEL' : account.role === 'member' ? 'MEMBER PANEL' : account.role === 'staff' ? 'STAFF PANEL' : 'ADMIN PANEL'}</p><nav>{allowed.map((name, i) => { const Icon = icons[i % icons.length]; return <button key={name} className={current === name ? 'active' : ''} onClick={() => go(name)}><Icon size={18}/>{name}</button>; })}</nav><div className="wf-account"><Badge tone="yellow">{M.roleNames[account.role]}</Badge><strong>{account.name}</strong><button onClick={() => { sessionStorage.removeItem(M.SESSION_KEY); setAccountId(''); setSelected(null); setDialog(null); setPage(''); setChallenge(null); setMobile(''); setDrawer(false); history.replaceState({}, '', '/'); }}><LogOut size={17}/>Sign out</button></div></aside>{drawer && <button className="wf-scrim" aria-label="Close menu" onClick={() => setDrawer(false)}/>}<div className="wf-main"><header className="wf-topbar"><button className="wf-icon wf-mobile" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22}/></button><span>{account.role === 'super_admin' ? 'Gym Pay Platform' : state.clients.find(c => c.id === account.gymId)?.name || 'Gym Pay'}</span><Badge>{M.roleNames[account.role]}</Badge></header><div className="wf-demo-banner">FRONTEND DEMO · OTP, permissions and payments are simulated. Data is saved on this device only.</div><main className="wf-content"><div className="wf-page-heading"><div>{selected && <button className="wf-link" onClick={() => go('Members')}><ArrowLeft size={16}/>Members</button>}<p className="wf-eyebrow">GYM PAY / {M.roleNames[account.role].toUpperCase()}</p><h1>{selected ? 'Member profile' : current === 'Dashboard' ? `${new Date().getHours() < 12 ? 'GOOD MORNING' : new Date().getHours() < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'} 👋` : current === 'Add member' ? '+ ADD MEMBER' : current}</h1></div><span className="wf-heading-date">{M.dateLabel(t)}</span></div>{formError && !dialog && current !== 'Add member' && <p className="wf-error" role="alert">{formError}</p>}{content()}</main><nav className="wf-bottom-nav">{allowed.slice(0, 3).map((name, i) => { const Icon = icons[i % icons.length]; return <button className={current === name ? 'active' : ''} onClick={() => go(name)} key={name}><Icon size={19}/><span>{name}</span></button>; })}<button onClick={() => setDrawer(true)}><Menu size={19}/><span>Menu</span></button></nav></div>{notice && <div className="wf-toast" role="status"><Check size={18}/><span>{notice}</span><button className="wf-icon" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></div>}{dialog && <Popup title={dialog === 'payment' ? (account.role === 'member' ? 'Make demo payment' : 'Record payment') : dialog === 'extend' ? 'Extend membership' : dialog === 'plan' ? 'Add membership plan' : dialog === 'staff' ? 'Add staff login' : 'Add expense'} close={() => setDialog(null)}><form onSubmit={saveDialog}>{dialog === 'payment' ? <><p className="wf-subtle">{memberName(state.memberships.find(m => m.id === target)?.memberId || '')} · Outstanding {M.money(M.balance(state, state.memberships.find(m => m.id === target)!))}</p>{account.role === 'member' && <div className="wf-demo-note">No money will be transferred. This records a demo payment only.</div>}<Field label="Amount received (₹)"><input autoFocus required type="number" min="0.01" max={M.balance(state, state.memberships.find(m => m.id === target)!)} step="0.01" value={record.amount} onChange={e => setRecord({ ...record, amount: e.target.value })}/></Field>{account.role !== 'member' && <Field label="Payment method"><select value={record.method} onChange={e => setRecord({ ...record, method: e.target.value })}>{['Cash', 'UPI', 'Card', 'Bank transfer'].map(v => <option key={v}>{v}</option>)}</select></Field>}</> : dialog === 'extend' ? <><Field label="Plan"><select required value={record.planId} onChange={e => setRecord({ ...record, planId: e.target.value })}>{plans.map(p => <option key={p.id} value={p.id}>{p.name} · {M.money(p.fee)}</option>)}</select></Field><Field label="Start date"><input required type="date" min={M.latest(state, target) ? M.shift(M.latest(state, target)!.expiry, 1) : undefined} value={record.start} onChange={e => setRecord({ ...record, start: e.target.value })}/></Field><p className="wf-subtle">Expiry: {record.start ? M.dateLabel(M.expiry(record.start, plans.find(p => p.id === record.planId)?.months || 1)) : '—'}. The new fee remains due until recorded.</p></> : <><Field label={dialog === 'staff' ? 'Staff name' : dialog === 'plan' ? 'Plan name' : 'Expense description'}><input autoFocus required value={record.name} onChange={e => setRecord({ ...record, name: e.target.value })}/></Field>{dialog === 'staff' ? <Field label="Mobile"><input required type="tel" value={record.mobile} onChange={e => setRecord({ ...record, mobile: e.target.value })}/></Field> : <Field label={dialog === 'plan' ? 'Membership fee (₹)' : 'Amount (₹)'}><input required type="number" min={dialog === 'plan' ? '0' : '0.01'} step="0.01" value={record.amount} onChange={e => setRecord({ ...record, amount: e.target.value })}/></Field>}{dialog === 'plan' && <Field label="Duration (months)"><input required type="number" min="1" step="1" value={record.months} onChange={e => setRecord({ ...record, months: e.target.value })}/></Field>}{dialog === 'expense' && <Field label="Date"><input required type="date" max={t} value={record.date} onChange={e => setRecord({ ...record, date: e.target.value })}/></Field>}</>}{formError && <p className="wf-error" role="alert">{formError}</p>}<button className="wf-primary wf-full">{dialog === 'payment' && account.role === 'member' ? 'CONFIRM DEMO PAYMENT' : 'SAVE'}</button></form></Popup>}</div>;
}
