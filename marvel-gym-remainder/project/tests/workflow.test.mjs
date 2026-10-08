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
 assert.deepEqual(M.menus.staff,['Payments','Pending dues']);
 assert.ok(!M.menus.member.includes('Members'));assert.ok(!M.menus.member.includes('Expenses'));
 assert.ok(M.menus.super_admin.includes('Client payments'));assert.ok(!M.menus.owner.includes('Clients'));
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
