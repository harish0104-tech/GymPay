import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { test, beforeEach } from 'node:test';
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const source=fs.readFileSync(new URL('../src/workflow/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const M=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
beforeEach(()=>storage.clear());
const owner=s=>s.accounts.find(a=>a.role==='owner');
const staff=s=>s.accounts.find(a=>a.role==='staff');
function draft(s,overrides={}) {return {name:'Test Member',mobile:'9876543210',birthday:'',planId:s.plans[0].id,fee:1500,start:M.today(),expiry:M.expiry(M.today(),1),payment:'partial',amount:500,...overrides};}
test('four role menus expose only intended workflows',()=>{
 assert.deepEqual(M.menus.staff,['Dashboard','Payments','Pending dues']);
 assert.ok(!M.menus.member.includes('Members'));assert.ok(!M.menus.member.includes('Expenses'));
 assert.ok(M.menus.super_admin.includes('Payments / Revenue'));assert.ok(!M.menus.owner.includes('Clients'));
});
test('partial payment preserves fee, receipt and outstanding through reload',()=>{
 const s=M.loadState();const id=M.addMember(s,owner(s),draft(s));const m=M.latest(s,id);
 assert.equal(M.received(s,m.id),500);assert.equal(M.balance(s,m),1000);
 M.persist(s);assert.equal(M.balance(M.loadState(),m),1000);
 M.recordPayment(s,staff(s),m.id,1000,'UPI');assert.equal(M.balance(s,m),0);
 assert.throws(()=>M.recordPayment(s,staff(s),m.id,1,'Cash'),/outstanding/);
});
test('paid, pending and partial validation prevents inconsistent receipts',()=>{
 const s=M.loadState();assert.throws(()=>M.addMember(s,owner(s),draft(s,{payment:'paid'})),/must match/);
 assert.throws(()=>M.addMember(s,owner(s),draft(s,{payment:'pending',amount:100})),/must match/);
 assert.throws(()=>M.addMember(s,owner(s),draft(s,{amount:2000})),/cannot exceed/);
 const id=M.addMember(s,owner(s),draft(s,{payment:'pending',amount:0}));assert.equal(M.balance(s,M.latest(s,id)),1500);
 assert.throws(()=>M.addMember(s,owner(s),draft(s)),/already/);
});
test('staff cannot add members or extend memberships',()=>{
 const s=M.loadState();assert.throws(()=>M.addMember(s,staff(s),draft(s)),/unavailable/);
 assert.throws(()=>M.extend(s,staff(s),s.members[0].id,s.plans[0].id,M.today()),/unavailable/);
});
test('members cannot read or pay another member or gym',()=>{
 const s=M.loadState();const a=s.accounts.find(a=>a.role==='member');
 assert.equal(M.visibleMembers(s,a).length,1);assert.equal(M.visibleMembers(s,a)[0].id,a.memberId);
 const other=s.memberships.find(m=>m.memberId!==a.memberId);
 assert.throws(()=>M.recordPayment(s,a,other.id,100,'Demo'),/unavailable/);
 assert.throws(()=>M.punch(s,a,other.memberId),/unavailable/);
 const outside={...staff(s),gymId:'other-gym'};assert.throws(()=>M.recordPayment(s,outside,s.memberships[0].id,100,'Cash'),/unavailable/);
});
test('attendance allows one in/out per day and rejects inactive memberships',()=>{
 const s=M.loadState();const a=s.accounts.find(a=>a.role==='member');
 M.punch(s,a,a.memberId);M.punch(s,a,a.memberId);assert.equal(s.attendance.length,1);assert.ok(s.attendance[0].out);
 assert.throws(()=>M.punch(s,a,a.memberId),/completed/);
 const expired=s.accounts.find(a=>a.role==='member'&&a.id!==s.accounts[3].id);M.latest(s,expired.memberId).expiry=M.shift(M.today(),-1);
 assert.throws(()=>M.punch(s,expired,expired.memberId),/active membership/);
});
test('inclusive monthly expiry and leap-year boundaries',()=>{
 assert.equal(M.expiry('2026-10-04',1),'2026-11-03');
 assert.equal(M.expiry('2026-01-31',1),'2026-02-27');
 assert.equal(M.expiry('2028-01-31',1),'2028-02-28');
 assert.equal(M.expiry('2026-10-04',12),'2027-10-03');
});
test('renewal retains current attendance eligibility and outstanding history',()=>{
 const s=M.loadState();const member=s.members[1];const current=M.currentMembership(s,member.id);const previousExpiry=current.expiry;
 M.extend(s,owner(s),member.id,s.plans[0].id,M.shift(previousExpiry,1));
 assert.equal(M.currentMembership(s,member.id).id,current.id);assert.equal(M.latest(s,member.id).renewal,true);
 assert.equal(M.dues(s,owner(s)).filter(m=>m.memberId===member.id).length,2);
 assert.throws(()=>M.extend(s,owner(s),member.id,s.plans[0].id,previousExpiry),/after/);
});
test('absence excludes recent check-ins and new members, includes seven-day absences',()=>{
 const s=M.loadState();const id=s.members[1].id;
 assert.ok(M.absentMemberships(s,owner(s)).some(m=>m.memberId===id));
 s.attendance.push({id:'recent',memberId:id,date:M.shift(M.today(),-6),in:new Date().toISOString(),out:null});
 assert.ok(!M.absentMemberships(s,owner(s)).some(m=>m.memberId===id));
 s.attendance[0].date=M.shift(M.today(),-7);
 assert.ok(M.absentMemberships(s,owner(s)).some(m=>m.memberId===id));
 const added=M.addMember(s,owner(s),draft(s));assert.ok(!M.absentMemberships(s,owner(s)).some(m=>m.memberId===added));
});


test('refund retains ledger, restores balance and reconciles collection',()=>{const s=M.loadState(),a=owner(s),p=s.payments[0],period=s.memberships.find(m=>m.id===p.membershipId);const count=s.payments.length;M.correctPayment(s,a,p.id,'refunded','Duplicate transfer');assert.equal(s.payments.length,count);assert.equal(M.balance(s,period),period.fee);const totals=M.collectionSummary(s.payments,M.today(),M.today());assert.equal(totals.net,0);assert.equal(totals.gross,1500);assert.equal(totals.refunds,1500);assert.throws(()=>M.correctPayment(s,a,p.id,'voided','Again'));assert.throws(()=>M.correctPayment(s,staff(s),p.id,'voided','Denied'));assert.ok(s.audit.some(a=>a.action==='PAYMENT_REFUNDED'));});
test('pending checkout cannot mark payment received and repeated outcome is idempotent',()=>{const s=M.loadState(),a=s.accounts.find(a=>a.role==='member'),m=M.latest(s,a.memberId);M.createDemoOrder(s,a,m.id,100);const p=s.payments.at(-1);assert.equal(M.received(s,m.id),0);assert.throws(()=>M.createDemoOrder(s,a,m.id,100));M.resolveDemoOrder(s,a,p.id,'successful');M.resolveDemoOrder(s,a,p.id,'successful');assert.equal(M.received(s,m.id),100);assert.ok(M.receiptFor(s,a,p.id).payment.receipt);assert.throws(()=>M.receiptFor(s,s.accounts.find(x=>x.role==='member'&&x.id!==a.id),p.id));});
test('permissions are owner controlled and subscription restrictions prevent changes',()=>{const s=M.loadState(),a=staff(s);M.saveStaff(s,owner(s),a.id,a.name,a.mobile,['payments','attendance'],true,'Reception duties');assert.ok(M.menusFor(a).includes('Attendance'));M.punch(s,a,s.members[0].id);s.clients[0].status='READ_ONLY';assert.throws(()=>M.recordPayment(s,a,s.memberships[0].id,100,'Cash'),/read-only/);s.clients[0].status='SUSPENDED';assert.throws(()=>M.recordPayment(s,a,s.memberships[0].id,100,'Cash'),/suspended/);});
test('reminders require consent, deduplicate and retry only failed jobs',()=>{const s=M.loadState(),a=owner(s),m=s.members[0];assert.equal(M.queueMessages(s,a,[m.id],'Expiry'),0);m.consent=true;assert.equal(M.queueMessages(s,a,[m.id],'Expiry'),1);assert.equal(M.queueMessages(s,a,[m.id],'Expiry'),0);const r=s.reminders.at(-1);assert.throws(()=>M.retryMessage(s,a,r.id));r.status='failed';M.retryMessage(s,a,r.id);assert.equal(r.status,'queued');});
test('plan edits preserve historical fees and tenant boundaries',()=>{const s=M.loadState(),a=owner(s),old=s.memberships[0].fee;M.savePlan(s,a,{...s.plans[0],fee:1900});assert.equal(s.memberships[0].fee,old);assert.throws(()=>M.savePlan(s,a,{...s.plans[0],gymId:'other'}));assert.throws(()=>M.updateSubscription(s,a,s.clients[0].id,{status:'SUSPENDED'},'Unauthorized'));});

test('staff navigation follows granted duties and retains personal help pages',()=>{
 const s=M.loadState(),a=staff(s);
 assert.deepEqual(M.menusFor(a).slice(0,3),['Dashboard','Payments','Pending dues']);
 for(const page of ['Profile','Billing / Help','Notifications'])assert.ok(M.menusFor(a).includes(page));
 assert.ok(!M.menusFor(a).includes('Reports'));assert.ok(!M.menusFor(a).includes('Gym Settings'));
 M.saveStaff(s,owner(s),a.id,a.name,a.mobile,['attendance','view_members'],true,'Check-in desk');
 assert.ok(M.menusFor(a).includes('Attendance'));assert.ok(M.menusFor(a).includes('Members'));
 assert.ok(!M.menusFor(a).includes('Payments'));assert.ok(!M.menusFor(a).includes('Pending dues'));
});
