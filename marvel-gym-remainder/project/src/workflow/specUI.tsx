import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Download, Plus, Search, X } from 'lucide-react';
import * as M from './model';
export type Update = (action:(state:M.State)=>void,message?:string)=>boolean;
export function Field({label,children}:{label:string;children:ReactNode}) {return <label className="wf-field"><span>{label}</span>{children}</label>;}
export function Status({value}:{value:string}) {const tone=/active|success|paid|delivered|resolved/i.test(value)&&!/inactive|unpaid/i.test(value)?'green':/failed|expired|suspend|void|cancel/i.test(value)?'red':'yellow';return <span className={'wf-badge '+tone}>{value.replaceAll('_',' ')}</span>;}
export function Table({head,rows,loading=false,error='',className=''}:{head:string[];rows:ReactNode[][];loading?:boolean;error?:string;className?:string}) {
 const [page,setPage]=useState(1);useEffect(()=>setPage(1),[rows.length]);const pages=Math.max(1,Math.ceil(rows.length/10));const current=Math.min(page,pages);
 if(loading)return <div className="wf-empty" role="status">Loading records…</div>;if(error)return <p role="alert" className="wf-error">{error}</p>;
 if(!rows.length)return <div className="wf-empty">No matching records. Change your filters or add a record to get started.</div>;
 return <><div className={'wf-table-wrap '+className}><table><thead><tr>{head.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.slice((current-1)*10,current*10).map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div><div className="spec-pagination"><span>{rows.length} records · Page {current} of {pages}</span><button className="wf-small" disabled={current===1} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="wf-small" disabled={current===pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></>;
}
export function Panel({title,action,children}:{title:string;action?:ReactNode;children:ReactNode}) {return <section className="wf-panel"><div className="wf-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;}
export function Stats({items}:{items:{label:string;value:ReactNode;action?:()=>void}[]}) {return <div className="wf-stats">{items.map(item=><button disabled={!item.action} onClick={item.action} key={item.label} className="wf-stat spec-stat"><span>{item.label}</span><strong>{item.value}</strong>{item.action&&<small>View details <ArrowRight size={12}/></small>}</button>)}</div>;}
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);return <dialog ref={ref} className="wf-dialog" aria-label={title} onCancel={close}><div className="wf-panel-heading"><h2>{title}</h2><button className="wf-icon" aria-label="Close dialog" onClick={close}><X size={20}/></button></div><div className="wf-dialog-content">{children}</div></dialog>;}
export function SearchBox({value,setValue,placeholder='Search records'}:{value:string;setValue:(s:string)=>void;placeholder?:string}) {return <div className="wf-search"><Search size={18}/><input value={value} aria-label={placeholder} placeholder={placeholder} onChange={e=>setValue(e.target.value)}/></div>;}
export function Tabs({tabs,value,setValue}:{tabs:string[];value:string;setValue:(s:string)=>void}) {return <div className="spec-tabs" role="group" aria-label="Sections">{tabs.map(t=><button key={t} className={t===value?'active':''} aria-pressed={t===value} onClick={()=>setValue(t)}>{t}</button>)}</div>;}
export function Info({items}:{items:[string,ReactNode][]}) {return <div className="wf-info-grid">{items.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;}
export async function exportFile(name:string,mime:string,bytes:Uint8Array) {
 const bridge=(window as Window & {ReactNativeWebView?:{postMessage:(message:string)=>void}}).ReactNativeWebView;
 if(bridge){let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));bridge.postMessage(JSON.stringify({type:'GYMPAY_EXPORT',name,mime,base64:btoa(binary)}));return;}
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csvBytes(head:string[],rows:(string|number)[][]) {const quote=(v:string|number)=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return new TextEncoder().encode('\ufeff'+[head,...rows].map(r=>r.map(quote).join(',')).join('\r\n'));}
export async function receiptPdf(state:M.State,account:M.Account,paymentId:string) {
 const {payment:p,member:m,membership:s,gym:g,settings}=M.receiptFor(state,account,paymentId);const {jsPDF}=await import('jspdf');const doc=new jsPDF();
 doc.setFontSize(24);doc.text('Gym Pay',20,25);doc.setFontSize(14);doc.text(g.name,20,38);doc.setFontSize(10);doc.text(settings.address||'Gym membership receipt',20,47);doc.text('DEMO RECEIPT - '+(p.receipt||p.id),20,62);
 const lines=[['Member',m.name],['Member code',m.code||m.id],['Membership period',M.dateLabel(s.start)+' to '+M.dateLabel(s.expiry)],['Amount','INR '+p.amount.toFixed(2)],['Method',p.method],['Date',M.dateLabel(p.date)],['Status',p.status||'successful'],['Reference',(p.reference?'****'+p.reference.slice(-4):'Not supplied')],['Recorded by',state.accounts.find(a=>a.id===p.recordedBy)?.name||'Unknown'],['Source',p.source||'Manual demo'],['Support',settings.phone||g.mobile]];
 lines.forEach(([label,value],i)=>{doc.setFont('helvetica','bold');doc.text(label,20,78+i*10);doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(value,115),75,78+i*10);});doc.setFontSize(9);doc.text('Frontend demo. This document does not verify a real transfer.',20,220);
 await exportFile('gym-pay-receipt-'+(p.receipt||p.id)+'.pdf','application/pdf',new Uint8Array(doc.output('arraybuffer')));
}
