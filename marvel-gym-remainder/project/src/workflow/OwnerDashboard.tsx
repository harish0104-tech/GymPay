import { Users, UserRound, UserX, Clock3, Plus, CreditCard, ChartNoAxesColumnIncreasing, ArrowRight, CalendarDays, MessageCircle, Wallet, CheckCircle2, BellRing, UserPlus, RefreshCw } from 'lucide-react';
import * as M from './model';
import type { PageProps } from './GymPages';

export default function OwnerDashboard({ state, account, go, select, add, remind }: { state: M.State; account: M.Account; go: PageProps['go']; select: PageProps['select']; add: () => void; remind: (ids: string[], kind: string) => void }) {
 const today = M.todayFor(state, account.gymId);
 const settings = M.settingsFor(state, account.gymId);
 const members = M.visibleMembers(state, account);
 const memberIds = new Set(members.map(member => member.id));
 const gym = state.clients.find(client => client.id === account.gymId);
 const payments = state.payments.filter(payment => memberIds.has(payment.memberId));
 const successfulPayments = payments.filter(payment => payment.status === 'successful' || !payment.status);
 const monthStart = `${today.slice(0, 7)}-01`;
 const monthly = M.collectionSummary(payments, monthStart, today);
 const active = members.filter(member => ['Active', 'Expiring'].includes(M.memberStatus(state, member)));
 const expired = members.filter(member => M.memberStatus(state, member) === 'Expired');
 const currentPeriods = members.map(member => M.currentMembership(state, member.id)).filter((period): period is M.Membership => !!period);
 const expiring = currentPeriods.filter(period => period.start <= today && M.days(period.expiry, today) >= 0 && M.days(period.expiry, today) <= settings.expiryWindow).sort((a, b) => a.expiry.localeCompare(b.expiry));
 const due = M.dues(state, account).filter(period => memberIds.has(period.memberId)).sort((a, b) => M.days(a.start, today) - M.days(b.start, today));
 const totalDue = due.reduce((sum, period) => sum + M.balance(state, period), 0);
 const checkins = state.attendance.filter(item => memberIds.has(item.memberId) && item.date === today).sort((a, b) => a.in.localeCompare(b.in));
 const uniqueCheckins = new Set(checkins.map(item => item.memberId)).size;
 const reminders = state.reminders.filter(item => memberIds.has(item.memberId));
 const queuedReminders = reminders.filter(item => item.status === 'queued').length;
 const failedReminders = reminders.filter(item => item.status === 'failed').length;
 const displayName = account.name === 'Gym Owner' ? 'Owner' : account.name.split(' ')[0];
 const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
 const memberName = (id: string) => members.find(member => member.id === id)?.name || 'Member';
 const planName = (period: M.Membership) => state.plans.find(item => item.id === period.planId)?.name || 'Membership';
 const methods = [...new Set(successfulPayments.filter(payment => payment.date >= monthStart && payment.date <= today).map(payment => payment.method || 'Other'))]
  .map(method => ({ method, amount: successfulPayments.filter(payment => payment.date >= monthStart && payment.date <= today && (payment.method || 'Other') === method).reduce((sum, payment) => sum + payment.amount, 0) }))
  .sort((a, b) => b.amount - a.amount);
 const newMembers = members.filter(member => member.created?.slice(0, 10) === today).length;
 const renewals = state.memberships.filter(period => memberIds.has(period.memberId) && period.start === today && period.renewal).length;
 const attendanceProgress = Math.min(100, Math.round(uniqueCheckins / Math.max(1, settings.attendanceTarget) * 100));
 const metrics = [
  { label: 'Total members', value: String(members.length), Icon: Users, tone: 'blue', page: 'Members' },
  { label: 'Active members', value: String(active.length), Icon: UserRound, tone: 'green', page: 'Members' },
  { label: `Expiring in ${settings.expiryWindow} days`, value: String(expiring.length), Icon: Clock3, tone: 'amber', page: 'Renewals' },
  { label: 'Expired members', value: String(expired.length), Icon: UserX, tone: 'rose', page: 'Members' },
  { label: 'Pending dues', value: M.money(totalDue), Icon: Wallet, tone: 'amber', page: 'Pending dues' },
  { label: "Today's collection", value: M.money(M.collectionSummary(payments, today, today).net), Icon: ChartNoAxesColumnIncreasing, tone: 'green', page: 'Payments' },
 ];
 const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

 return <div className="od-dashboard od-reference-dashboard od-owner-reference-v2">
  <div className="od-ref-welcome"><div><h1>{greeting}, {displayName}</h1><p>{M.dateLabel(today)}{gym?.name ? ` · ${gym.name}` : ''}</p></div><button className="wf-primary od-ref-primary-add" onClick={add}><Plus size={18}/>Add member</button></div>
  <div className="od-ref-metrics">{metrics.map(({ label, value, Icon, tone, page }) => <button key={label} className={'od-ref-metric ' + tone} onClick={() => go(page)}><span className={'od-ref-metric-icon ' + tone}><Icon size={20}/></span><span className="od-ref-metric-label">{label}</span><strong>{value}</strong></button>)}</div>

  <div className="od-owner-reference-tables">
   <section className="od-ref-panel"><header><div><h2>Payment due today</h2><p>{due.length} outstanding membership {due.length === 1 ? 'payment' : 'payments'}</p></div><button onClick={() => go('Pending dues')}>View all <ArrowRight size={15}/></button></header>
    {due.length ? <div className="od-owner-table-wrap"><table><thead><tr><th>Name</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{due.slice(0, 4).map(period => <tr key={period.id}><td><button className="od-owner-member-link" onClick={() => select(period.memberId)}>{memberName(period.memberId)}</button></td><td>{M.money(M.balance(state, period))}</td><td><span className="od-owner-status due">Due</span></td><td><button className="od-owner-table-action" onClick={() => go('Payments')}>Record payment</button></td></tr>)}</tbody></table></div> : <div className="od-owner-table-empty"><CheckCircle2 size={18}/>No payments are due today.</div>}
   </section>
   <section className="od-ref-panel"><header><div><h2>Expiring soon</h2><p>Memberships ending within {settings.expiryWindow} days</p></div><button onClick={() => go('Renewals')}>View all <ArrowRight size={15}/></button></header>
    {expiring.length ? <div className="od-owner-table-wrap"><table><thead><tr><th>Name</th><th>Plan</th><th>Expiry date</th><th>Days left</th></tr></thead><tbody>{expiring.slice(0, 4).map(period => <tr key={period.id}><td><button className="od-owner-member-link" onClick={() => select(period.memberId)}>{memberName(period.memberId)}</button></td><td>{planName(period)}</td><td>{date(period.expiry)}</td><td><span className="od-owner-status soon">{M.days(period.expiry, today) === 0 ? 'Today' : `${M.days(period.expiry, today)} days`}</span></td></tr>)}</tbody></table><button className="od-owner-remind-all" onClick={() => remind(expiring.slice(0, 4).map(period => period.memberId), 'Membership expiry reminder')}><BellRing size={15}/>Send reminders</button></div> : <div className="od-owner-table-empty"><CheckCircle2 size={18}/>No memberships expiring in this period.</div>}
   </section>
  </div>

  <div className="od-owner-reference-bottom">
   <section className="od-ref-panel"><header><div><h2><CalendarDays size={17}/>Monthly collection</h2><p>{new Date(`${monthStart}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p></div><button onClick={() => go('Reports')}>Reports <ArrowRight size={15}/></button></header><div className="od-owner-month-total">{M.money(monthly.net)}</div>{methods.length ? <div className="od-owner-methods">{methods.slice(0, 3).map((item, index) => <div key={item.method}><span className={`od-owner-method-icon method-${index}`}><CreditCard size={16}/></span><small>{item.method}</small><strong>{M.money(item.amount)}</strong></div>)}</div> : <p className="od-owner-empty-note">No successful payments recorded this month.</p>}</section>
   <section className="od-ref-panel"><header><div><h2><Users size={17}/>Attendance today</h2><p>Daily check-ins and activity</p></div><button onClick={() => go('Attendance')}>View all <ArrowRight size={15}/></button></header><div className="od-owner-attendance-total"><strong>{uniqueCheckins} <span>/ {settings.attendanceTarget}</span></strong><b>{attendanceProgress}%</b></div><div className="od-ref-progress" role="progressbar" aria-label="Attendance target progress" aria-valuenow={attendanceProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: attendanceProgress + '%' }}/></div><div className="od-owner-attendance-foot"><div><UserPlus size={17}/><span>New members<strong>{newMembers}</strong></span></div><div><RefreshCw size={17}/><span>Renewals<strong>{renewals}</strong></span></div></div></section>
   <section className="od-ref-panel"><header><div><h2><MessageCircle size={17}/>WhatsApp reminders</h2><p>Message queue status</p></div><button onClick={() => go('WhatsApp')}>View all <ArrowRight size={15}/></button></header><div className="od-owner-reminder-stats"><button onClick={() => go('WhatsApp')}><span className="od-owner-reminder-dot queued"/><small>Queued</small><strong>{queuedReminders}</strong></button><button onClick={() => go('WhatsApp')}><span className="od-owner-reminder-dot failed"/><small>Failed</small><strong>{failedReminders}</strong></button></div><p className="od-owner-reminder-note">Reminders are stored in the app until a WhatsApp provider is connected.</p></section>
  </div>
 </div>;
}
