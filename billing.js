const D=require('./db'),BL=require('./shared/pricing');
/* Finds every Active, unpaused subscription that is due, creates one draft invoice per billing period,
   advances the next billing date, and closes expired subscriptions. One transaction; unique key = no duplicates. */
function runBilling(){const t=new Date().toISOString().slice(0,10);
 return D.tx(()=>{let n=0;const taxes=D.all('taxes'),discs=D.all('discounts'),touched=new Set();
  const subs=D.all('subscriptions',"json_extract(data,'$.status')='Active'");
  const has=D.db.prepare("SELECT 1 FROM invoices WHERE json_extract(data,'$.key')=?");
  for(const s of subs){const p=D.get('plans',s.planId);if(!p)continue;let ch=false;
   if(!s.paused){let g=0;
    while(s.next&&s.next<=t&&s.next<=s.expiry&&g++<400){const key=s.id+'|'+s.next;
     if(!has.get(key)){const c=BL.calc(s.lines,taxes,discs,t);
      c.used.forEach(id=>{const d=discs.find(x=>x.id==id);d.used=(d.used||0)+1;touched.add(id)});
      D.put('invoices',{id:D.uid(),number:'INV-'+String(D.seq('inv')).padStart(4,'0'),key,subId:s.id,customerId:s.customerId,issue:t,period:s.next,due:BL.addD(t,BL.termD(s.terms)),lines:c.lines,subtotal:c.subtotal,discount:c.discount,tax:c.tax,total:c.total,status:'Draft',sent:false});n++}
     s.next=BL.nextP(s.next,p.freq);ch=true}}
   if(s.expiry<t&&p.autoClose=='yes'){s.status='Closed';s.closed=t;ch=true}
   if(ch)D.put('subscriptions',s)}
  touched.forEach(id=>D.put('discounts',discs.find(x=>x.id==id)));
  return n})}
module.exports={runBilling};
