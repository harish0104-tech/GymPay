import SpecPages from './SpecPages';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CreditCard, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Users, X, Bell, ChevronDown, Home, CalendarCheck, RefreshCw, BarChart3, Settings, MoreHorizontal, Wallet, MessageCircle, Dumbbell } from 'lucide-react';
import * as M from './model';
import {loadGymState,readSaasSession,requestPhoneOtp,saasConfigured,signOutSaas,syncGymChanges,verifyPhoneOtp,writeSaasSession,type SaasSession} from '@/lib/saasBackend';
import './workflow.css';
import './ownerDashboard.css';
type Dialog = 'payment' | 'extend' | 'plan' | 'expense' | 'staff' | null;
const pageIcons:Record<string,typeof LayoutDashboard>={Dashboard:LayoutDashboard,Home:Home,Members:Users,'Membership plans':CreditCard,Membership:CreditCard,Payments:CreditCard,'Pay Fees':CreditCard,'Payment history / Receipts':CreditCard,'Pending dues':Wallet,Attendance:CalendarCheck,'Attendance / QR':CalendarCheck,Renewals:RefreshCw,WhatsApp:MessageCircle,Reports:BarChart3,Expenses:CreditCard,Staff:Users,Profile:Users,Notifications:Bell,Support:MessageCircle,'Billing / Help':CreditCard,'Gym Settings':Settings,'Audit Logs':ShieldCheck,Overview:LayoutDashboard,Gyms:Users,Users:Users,Subscriptions:RefreshCw,'Payments / Revenue':Wallet,'System Settings':Settings};
const ownerIcons:Record<string,typeof LayoutDashboard>={Dashboard:Home,Members:Users,'Membership plans':CreditCard,Payments:CreditCard,'Pending dues':Wallet,Attendance:CalendarCheck,Renewals:RefreshCw,WhatsApp:MessageCircle,Reports:BarChart3,Staff:Users,'Gym Settings':Settings};
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
    const [accountId, setAccountId] = useState(() => saasConfigured ? '' : sessionStorage.getItem(M.SESSION_KEY) || '');
    const account = state.accounts.find(a => a.id === accountId && a.active);
    const [page, setPage] = useState(() => new URLSearchParams(location.search).get('view') || '');
    const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('member'));
    const [mobile, setMobile] = useState('');
    const [saasSession,setSaasSession]=useState<SaasSession|null>(()=>saasConfigured?readSaasSession():null);
    const [saasReady,setSaasReady]=useState(!saasConfigured);
    const [signupMode,setSignupMode]=useState(false);
    const [signupName,setSignupName]=useState('');
    const [gymName,setGymName]=useState('');
    const [headerSearch,setHeaderSearch]=useState('');
    useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[page,selected,accountId]);
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
    const allowed = account ? M.menusFor(account) : [];
    const ownerSidebarItems = [{ page: 'Dashboard', label: 'Dashboard' }, { page: 'Members', label: 'Members' }, { page: 'Payments', label: 'Payments' }, { page: 'Membership plans', label: 'Plans' }, { page: 'Reports', label: 'Reports' }, { page: 'Staff', label: 'Staff' }];
    const current = allowed.includes(page) || page === 'Add member' && !!account && M.can(account, 'add_members') ? page : allowed[0];
    useEffect(()=>{
        if(!saasConfigured){setSaasReady(true);return;}
        const saved=readSaasSession();
        if(!saved){setSaasReady(true);return;}
        let cancelled=false;
        void loadGymState(saved).then(result=>{
            if(cancelled)return;
            setState(result.state);setAccountId(result.accountId);setSaasSession(result.session);
            const signedIn=result.state.accounts.find(item=>item.id===result.accountId);
            if(signedIn)setPage(M.menus[signedIn.role]?.[0]||'Dashboard');
        }).catch(error=>{
            if(cancelled)return;
            writeSaasSession(null);setSaasSession(null);setLoginError(error instanceof Error?error.message:'Could not restore your GymPay session.');
        }).finally(()=>{if(!cancelled)setSaasReady(true);});
        return()=>{cancelled=true;};
    },[]);
    useEffect(() => { if (!notice)
        return; const timeout = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timeout); }, [notice]);
    useEffect(() => { if(saasConfigured)return;const update = () => { try {
        setState(M.loadState());
    }
    catch {
        setNotice('Could not reload saved demo data.');
    } }; window.addEventListener('storage', update); return () => window.removeEventListener('storage', update); }, []);
    function update(action: (next: M.State) => void, message = 'Saved locally.') {
        const next = structuredClone(state);
        try {
            action(next);
            if(saasConfigured){
                if(!saasSession||!account)throw new Error('Sign in again to save to your shared GymPay workspace.');
                setState(next);
                setNotice('Saving changes to your gym workspace…');
                void syncGymChanges(state,next,saasSession,account).then(saved=>{
                    setState(saved);setSaasSession(readSaasSession());setNotice('Saved to your shared gym workspace.');
                }).catch(error=>setNotice(error instanceof Error?`Could not sync changes: ${error.message}`:'Could not sync changes to GymPay.'));
            }else{
                M.persist(next);setState(next);setNotice(message);
            }
            setFormError('');
            return true;
        }
        catch (error) {
            setFormError(error instanceof Error ? error.message : 'Unable to save.');
            return false;
        }
    }
    useEffect(() => { const back = () => { const route = new URLSearchParams(location.search); setPage(route.get('view') || ''); setSelected(route.get('member')); setDialog(null); setDrawer(false); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
    function logout() {
        if (saasConfigured && saasSession) { void signOutSaas(saasSession).catch(()=>{});writeSaasSession(null); }
        sessionStorage.removeItem(M.SESSION_KEY);
        setSaasSession(null);setAccountId('');setSelected(null);setDialog(null);setPage('');setChallenge(null);setMobile('');setDrawer(false);history.replaceState({},'','/');
    }
    function viewMember(id: string) { setPage('Members'); setSelected(id); history.pushState({}, '', `/?view=Members&member=${encodeURIComponent(id)}`); }
    function go(next: string) { setPage(next); setSelected(null); setSearch(''); setDrawer(false); setFormError(''); history.pushState({}, '', `/?view=${encodeURIComponent(next)}`); }
    function open(kind: Dialog, memberId = '') { setTarget(memberId); const membership = memberId ? M.latest(state, memberId) : undefined; setRecord({ amount: membership ? String(M.balance(state, membership)) : '', method: 'Cash', planId: membership?.planId || state.plans.find(p => p.gymId === account?.gymId)?.id || '', start: membership && membership.expiry >= M.today() ? M.shift(membership.expiry, 1) : M.today(), name: '', mobile: '', months: '1', date: M.today() }); setFormError(''); setDialog(kind); }
    function openPayment(membershipId: string) { const m = state.memberships.find(m => m.id === membershipId); if (m) {
        open('payment', m.memberId);
        setTarget(membershipId);
        setRecord(r => ({ ...r, amount: String(M.balance(state, m)) }));
    } }
    async function requestOtp(e: FormEvent) { e.preventDefault(); if(saasConfigured){const normalized=M.normalizeMobile(mobile);if(normalized.length!==10){setLoginError('Enter a valid 10-digit mobile number.');return;}if(signupMode&&(!signupName.trim()||!gymName.trim())){setLoginError('Enter your name and gym name to create an owner account.');return;}try{await requestPhoneOtp(`+91${normalized}`,signupMode?{fullName:signupName.trim(),gymName:gymName.trim()}:undefined);setChallenge({id:'production-otp',expires:Date.now()+5*60000});setOtp('');setLoginError('');}catch(error){setLoginError(error instanceof Error?error.message:'Could not send your sign-in code.');}return;} const found = state.accounts.find(a => a.mobile === M.normalizeMobile(mobile) && a.active); if (!found) {
        setLoginError('No active demo account for this mobile. Choose one below.');
        return;
    } setChallenge({ id: found.id, expires: Date.now() + 5 * 60000 }); setOtp(''); setLoginError(''); }
    async function verify(e: FormEvent) { e.preventDefault(); if (!challenge || challenge.expires < Date.now()) {
        setLoginError('Your sign-in code expired. Request a new code.');
        setChallenge(null);
        return;
    } if(saasConfigured){const normalized=M.normalizeMobile(mobile);try{const verified=await verifyPhoneOtp(`+91${normalized}`,otp);const result=await loadGymState(verified);setState(result.state);setSaasSession(result.session);setAccountId(result.accountId);sessionStorage.removeItem(M.SESSION_KEY);const signedIn=result.state.accounts.find(item=>item.id===result.accountId);setPage(M.menus[signedIn?.role||'owner']?.[0]||'Dashboard');setChallenge(null);setOtp('');setSignupMode(false);setLoginError('');}catch(error){setLoginError(error instanceof Error?error.message:'Could not verify the code or open your gym workspace.');}return;} if (otp !== M.DEMO_OTP) {
        setLoginError('Use demo code 123456. No SMS is sent.');
        return;
    } const found = state.accounts.find(a => a.id === challenge.id && a.active); if (!found) {
        setLoginError('This demo account is inactive.');
        return;
    } update(s=>{const a=s.accounts.find(a=>a.id===found.id)!;a.lastLogin=new Date().toISOString();M.audit(s,a,'DEMO_LOGIN',a.id,null,{role:a.role});},'Demo login successful.'); sessionStorage.setItem(M.SESSION_KEY, found.id); setAccountId(found.id); setPage(M.menus[found.role][0]); setChallenge(null); setOtp(''); }
    if (!account)
        return <div className="wf wf-login"><div className="wf-login-intro"><img src="/gym-pay-logo.svg" alt="Gym Pay"/><Badge tone="yellow">ONE GYM. ONE WORKFLOW.</Badge><h1>Less admin.<br />More momentum.</h1><p>Members, collections and attendance — together in one place.</p><div className="wf-login-roles">{saasConfigured?'For gym owners and teams':'Owner · Staff · Member · Super Admin'}</div></div><main className="wf-login-main"><div className="wf-login-card"><ShieldCheck size={30}/><h2>{!saasReady?'Opening your workspace…':challenge?'Enter your code':saasConfigured&&signupMode?'Create your gym workspace':'Welcome to Gym Pay'}</h2><p>{challenge?'Enter the verification code sent to your mobile.':saasConfigured&&signupMode?'Start a secure account for your gym.':'Enter your mobile to continue to your gym dashboard.'}</p>{saasConfigured&&!challenge&&<div className="wf-auth-mode"><span>{signupMode?'Already have an account?':'New to GymPay?'}</span><button type="button" className="wf-link" onClick={()=>{setSignupMode(!signupMode);setLoginError('');}}> {signupMode?'Sign in':'Create gym account'}</button></div>}<form onSubmit={challenge?verify:requestOtp}>{saasConfigured&&signupMode&&!challenge&&<><Field label="Your name"><input required autoComplete="name" value={signupName} onChange={e=>setSignupName(e.target.value)} placeholder="Full name"/></Field><Field label="Gym name"><input required value={gymName} onChange={e=>setGymName(e.target.value)} placeholder="Your gym"/></Field></>}<Field label="Mobile number"><div className="wf-phone"><span>+91</span><input required type="tel" inputMode="tel" autoComplete="tel-national" disabled={!!challenge||!saasReady} value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="10-digit mobile"/></div></Field>{challenge&&<Field label={saasConfigured?'Verification code':'Demo OTP'}><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6-digit code"/></Field>}{loginError&&<p role="alert" className="wf-error">{loginError}</p>}<button disabled={!saasReady} className="wf-primary wf-full">{challenge?'VERIFY & CONTINUE':saasConfigured?'SEND OTP':'GET DEMO OTP'}<ArrowRight size={18}/></button>{challenge&&<button type="button" className="wf-link" onClick={()=>{setChallenge(null);setLoginError('');}}>Change mobile / request again</button>}</form>{!saasConfigured&&<details open><summary>Try a demo account</summary><div className="wf-demo-accounts">{state.accounts.filter(a=>a.active).filter((a,index,accounts)=>accounts.findIndex(candidate=>candidate.active&&candidate.role===a.role)===index).slice(0,4).map(a=><button key={a.id} onClick={()=>{setMobile(a.mobile);setChallenge(null);setLoginError('');}}><span>{M.roleNames[a.role]}<small>{a.name}</small></span><b>{a.mobile}</b></button>)}</div></details>}</div></main></div>;
    const members = M.visibleMembers(state, account);
    const memberIds = new Set(members.map(m => m.id));
    const memberships = state.memberships.filter(m => memberIds.has(m.memberId));
    const payments = state.payments.filter(p => memberIds.has(p.memberId));
    const attendance = state.attendance.filter(a => memberIds.has(a.memberId));
    const expenses = state.expenses.filter(e => e.gymId === account.gymId);
    const plans = state.plans.filter(p => p.gymId === account.gymId && p.active !== false);
    const due = M.dues(state, account);
    const member = members.find(m => m.id === (account.role === 'member' ? account.memberId : selected));
    const membership = member ? M.currentMembership(state, member.id) : undefined;
    const plan = plans.find(p => p.id === membership?.planId);
    const t = M.todayFor(state, account.gymId);
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
        if (account && account.role !== 'super_admin' && account.role !== 'member' && ['SUSPENDED','CANCELLED','EXPIRED'].includes(M.subscriptionStatus(state,account.gymId)) && current !== 'Billing / Help') return <section className='wf-panel'><h2>Subscription access restricted</h2><p>Your gym records are retained. Contact support to restore access.</p><button className='wf-primary' onClick={()=>go('Billing / Help')}>Billing / Help</button></section>;
        if (account && current !== 'Add member') return <SpecPages state={state} account={account} page={current} selected={selected} update={update} go={go} select={viewMember} add={beginAdd}/>;
        if (selected && account!.role === 'owner')
            return profile();
        if (current === 'Add member')
            return <form className="wf-member-form wf-panel" onSubmit={saveMember}><div className="wf-form-grid"><Field label="Name"><input required autoComplete="name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field><Field label="Mobile"><input required type="tel" inputMode="tel" value={draft.mobile} onChange={e => setDraft({ ...draft, mobile: e.target.value })}/></Field><Field label="Plan"><select required value={draft.planId} onChange={e => { const p = plans.find(p => p.id === e.target.value)!; setDraft({ ...draft, planId: p.id, fee: String(p.fee), amount: draft.payment === 'paid' ? String(p.fee) : draft.payment === 'pending' ? '0' : draft.amount, expiry: M.expiry(draft.start, p.months) }); }}>{plans.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field><Field label="Membership Fee (₹)"><input required type="number" min="0" step="0.01" readOnly={account!.role === 'staff'} value={draft.fee} onChange={e => setDraft({ ...draft, fee: e.target.value, amount: draft.payment === 'paid' ? e.target.value : draft.amount })}/></Field><Field label="Start Date"><input required type="date" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value, expiry: e.target.value ? M.expiry(e.target.value, plans.find(p => p.id === draft.planId)?.months || 1) : '' })}/></Field><Field label="Expiry Date"><input required type="date" min={draft.start} readOnly={account!.role === 'staff'} value={draft.expiry} onChange={e => setDraft({ ...draft, expiry: e.target.value })}/></Field><fieldset className="wf-radio"><legend>Payment</legend>{['paid', 'pending', 'partial'].map(value => <label key={value}><input type="radio" name="payment" value={value} checked={draft.payment === value} onChange={() => setDraft({ ...draft, payment: value, amount: value === 'paid' ? draft.fee : value === 'pending' ? '0' : '' })}/>{value[0].toUpperCase() + value.slice(1)}</label>)}</fieldset><Field label="Amount Received (₹)"><input required type="number" min="0" max={draft.fee} step="0.01" readOnly={draft.payment !== 'partial'} value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })}/></Field><Field label="Birthday (optional)"><input type="date" max={t} value={draft.birthday} onChange={e => setDraft({ ...draft, birthday: e.target.value })}/></Field></div><p className="wf-subtle">Outstanding: {M.money(Math.max(0, Number(draft.fee) - Number(draft.amount)))} · Monthly expiry is the day before the next membership period.</p>{formError && <p className="wf-error" role="alert">{formError}</p>}<button className="wf-primary wf-full">SAVE MEMBER</button></form>;
        return null;
    }
    return <div className={'wf wf-app'+(account.role==='owner'?' wf-owner':'')+(account.role==='owner'&&current==='Dashboard'&&!selected?' wf-owner-dashboard':'')}><aside className={'wf-sidebar ' + (drawer ? 'is-open' : '')}><div className="wf-brand">{account.role==='owner'?<div className="od-brand"><Dumbbell size={35}/><span>Gym Pay</span></div>:<img src="/gym-pay-logo.svg" alt="Gym Pay"/>}<button className="wf-icon wf-mobile" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={20}/></button></div><p className="wf-nav-caption">{account.role === 'super_admin' ? 'PLATFORM PANEL' : account.role === 'member' ? 'MEMBER PANEL' : account.role === 'staff' ? 'STAFF PANEL' : 'ADMIN PANEL'}</p><nav>{account.role==='owner'?ownerSidebarItems.map(({page,label})=>{const Icon=ownerIcons[page]||pageIcons[page]||LayoutDashboard;return <button key={page} className={current===page?'active':''} onClick={()=>go(page)}><Icon size={18}/>{label}</button>}):allowed.map(name=>{const Icon=pageIcons[name]||LayoutDashboard;return <button key={name} className={current===name?'active':''} onClick={()=>go(name)}><Icon size={18}/>{name}</button>})}</nav><div className="wf-account">{account.role==='owner'&&<small className="od-signed-in">Signed in as</small>}<Badge tone="yellow">{M.roleNames[account.role]}</Badge><strong>{account.name}</strong><button onClick={logout}><LogOut size={17}/>Sign out</button></div></aside>{drawer && <button className="wf-scrim" aria-label="Close menu" onClick={() => setDrawer(false)}/>}<div className="wf-main">{account.role==='owner'?<header className="wf-topbar od-topbar"><span className="od-gym-name">{state.clients.find(c=>c.id===account.gymId)?.name||'Gym Pay Fitness'}<ChevronDown size={16}/></span><button className="od-mobile-brand" onClick={()=>setDrawer(true)} aria-label="Open menu"><Dumbbell size={25}/> <span>Gym Pay</span></button><div className="od-header-search"><form onSubmit={e=>{e.preventDefault();const match=members.find(m=>(m.name+' '+m.mobile).toLowerCase().includes(headerSearch.toLowerCase()));if(match&&headerSearch.trim()){viewMember(match.id);setHeaderSearch('');}else go('Members');}}><Search size={17}/><input aria-label="Search members" placeholder="Search members..." value={headerSearch} onChange={e=>setHeaderSearch(e.target.value)}/></form>{headerSearch.trim()&&<div className="od-search-results">{members.filter(m=>(m.name+' '+m.mobile).toLowerCase().includes(headerSearch.toLowerCase())).slice(0,5).map(m=><button key={m.id} onClick={()=>{viewMember(m.id);setHeaderSearch('');}}>{m.name}<small>{m.mobile}</small></button>)}{!members.some(m=>(m.name+' '+m.mobile).toLowerCase().includes(headerSearch.toLowerCase()))&&<p>No matching members</p>}</div>}</div><div className="od-topbar-actions"><button className="wf-icon od-bell" aria-label="Notifications" onClick={()=>go('Notifications')}><Bell size={23}/></button><button className="od-account-avatar" aria-label="Owner account and billing" onClick={()=>go('Billing / Help')}>{account.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</button><ChevronDown size={14}/></div></header>:<header className="wf-topbar"><button className="wf-icon wf-mobile" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22}/></button><span>{account.role === 'super_admin' ? 'Gym Pay Platform' : state.clients.find(c => c.id === account.gymId)?.name || 'Gym Pay'}</span><Badge>{M.roleNames[account.role]}</Badge><div className='spec-row-actions'><button className='wf-small wf-header-icon' aria-label='Notifications' onClick={()=>go(account.role==='member'?'Notifications':account.role==='super_admin'?'Support':'Notifications')}><Bell size={17}/><span>Notifications</span></button><button className='wf-small wf-account-menu' aria-label={`Open ${account.name} profile`} onClick={()=>go(account.role==='member'?'Profile':account.role==='super_admin'?'Users':account.role==='staff'?'Profile':'Billing / Help')}><span className='wf-account-initials'>{account.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span><span>{account.name}</span></button></div></header>}<div className="wf-demo-banner">{saasConfigured?`SECURE GYM WORKSPACE · ${M.settingsFor(state,account.gymId).timezone} · ${M.settingsFor(state,account.gymId).currency}`:'FRONTEND DEMO · OTP, permissions and payments are simulated. Data is saved on this device only.'}</div><main className="wf-content"><div className="wf-page-heading"><div>{selected && <button className="wf-link" onClick={() => go('Members')}><ArrowLeft size={16}/>Members</button>}<p className="wf-eyebrow">GYM PAY / {M.roleNames[account.role].toUpperCase()}</p><h1>{selected ? 'Member profile' : current === 'Dashboard' ? `${new Date().getHours() < 12 ? 'GOOD MORNING' : new Date().getHours() < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'} 👋` : current === 'Add member' ? '+ ADD MEMBER' : current}</h1></div><span className="wf-heading-date">{M.dateLabel(t)}</span></div>{formError && !dialog && current !== 'Add member' && <p className="wf-error" role="alert">{formError}</p>}{content()}</main><nav className="wf-bottom-nav">{(account.role==='owner'?['Dashboard','Members','Payments']:allowed.slice(0,3)).map(name => { const Icon = account.role==='owner'?(ownerIcons[name]||Home):(pageIcons[name]||LayoutDashboard); return <button className={current === name ? 'active' : ''} onClick={() => go(name)} key={name}><Icon size={19}/><span>{account.role==='owner'&&name==='Dashboard'?'Home':name}</span></button>; })}<button onClick={() => setDrawer(true)}>{account.role==='owner'?<MoreHorizontal size={19}/>:<Menu size={19}/>}<span>{account.role==='owner'?'More':'Menu'}</span></button></nav></div>{notice && <div className="wf-toast" role="status"><Check size={18}/><span>{notice}</span><button className="wf-icon" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></div>}{dialog && <Popup title={dialog === 'payment' ? (account.role === 'member' ? 'Make demo payment' : 'Record payment') : dialog === 'extend' ? 'Extend membership' : dialog === 'plan' ? 'Add membership plan' : dialog === 'staff' ? 'Add staff login' : 'Add expense'} close={() => setDialog(null)}><form onSubmit={saveDialog}>{dialog === 'payment' ? <><p className="wf-subtle">{memberName(state.memberships.find(m => m.id === target)?.memberId || '')} · Outstanding {M.money(M.balance(state, state.memberships.find(m => m.id === target)!))}</p>{account.role === 'member' && <div className="wf-demo-note">No money will be transferred. This records a demo payment only.</div>}<Field label="Amount received (₹)"><input autoFocus required type="number" min="0.01" max={M.balance(state, state.memberships.find(m => m.id === target)!)} step="0.01" value={record.amount} onChange={e => setRecord({ ...record, amount: e.target.value })}/></Field>{account.role !== 'member' && <Field label="Payment method"><select value={record.method} onChange={e => setRecord({ ...record, method: e.target.value })}>{['Cash', 'UPI', 'Card', 'Bank transfer'].map(v => <option key={v}>{v}</option>)}</select></Field>}</> : dialog === 'extend' ? <><Field label="Plan"><select required value={record.planId} onChange={e => setRecord({ ...record, planId: e.target.value })}>{plans.map(p => <option key={p.id} value={p.id}>{p.name} · {M.money(p.fee)}</option>)}</select></Field><Field label="Start date"><input required type="date" min={M.latest(state, target) ? M.shift(M.latest(state, target)!.expiry, 1) : undefined} value={record.start} onChange={e => setRecord({ ...record, start: e.target.value })}/></Field><p className="wf-subtle">Expiry: {record.start ? M.dateLabel(M.expiry(record.start, plans.find(p => p.id === record.planId)?.months || 1)) : '—'}. The new fee remains due until recorded.</p></> : <><Field label={dialog === 'staff' ? 'Staff name' : dialog === 'plan' ? 'Plan name' : 'Expense description'}><input autoFocus required value={record.name} onChange={e => setRecord({ ...record, name: e.target.value })}/></Field>{dialog === 'staff' ? <Field label="Mobile"><input required type="tel" value={record.mobile} onChange={e => setRecord({ ...record, mobile: e.target.value })}/></Field> : <Field label={dialog === 'plan' ? 'Membership fee (₹)' : 'Amount (₹)'}><input required type="number" min={dialog === 'plan' ? '0' : '0.01'} step="0.01" value={record.amount} onChange={e => setRecord({ ...record, amount: e.target.value })}/></Field>}{dialog === 'plan' && <Field label="Duration (months)"><input required type="number" min="1" step="1" value={record.months} onChange={e => setRecord({ ...record, months: e.target.value })}/></Field>}{dialog === 'expense' && <Field label="Date"><input required type="date" max={t} value={record.date} onChange={e => setRecord({ ...record, date: e.target.value })}/></Field>}</>}{formError && <p className="wf-error" role="alert">{formError}</p>}<button className="wf-primary wf-full">{dialog === 'payment' && account.role === 'member' ? 'CONFIRM DEMO PAYMENT' : 'SAVE'}</button></form></Popup>}</div>;
}









