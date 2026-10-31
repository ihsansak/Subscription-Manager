require('dotenv').config();
const express=require('express'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const D=require('./db'),BL=require('./shared/pricing'),{runBilling}=require('./billing'),{sendOtp}=require('./mailer');
require('./seed')();
const PROD=process.env.NODE_ENV==='production',PORT=+process.env.PORT||3000,DAY=864e5;
const today=()=>new Date().toISOString().slice(0,10);
class HE extends Error{constructor(s,m){super(m);this.s=s}}
const bad=m=>new HE(400,m),nf=m=>new HE(404,m||'Not found.');
const wrap=f=>(q,s,n)=>Promise.resolve().then(()=>f(q,s)).then(r=>{if(r!==undefined)s.json(r)}).catch(n);
const sha=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const eq=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length==b.length&&crypto.timingSafeEqual(a,b)};
const str=(v,n=200)=>String(v??'').trim().slice(0,n);
const isDate=d=>/^\d{4}-\d\d-\d\d$/.test(d)&&!isNaN(new Date(d));
const EMAIL=/^\S+@\S+\.\S+$/,PWMSG='Password needs 9 or more characters with an uppercase letter, a lowercase letter and a special character.';
const app=express();app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));app.use((q,s,n)=>{q.body=q.body||{};s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('X-Frame-Options','SAMEORIGIN');n()});
/* ---- sessions ---- */
const cookies=q=>Object.fromEntries((q.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x[0]));
function session(s,u){const tok=crypto.randomBytes(32).toString('hex');D.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(tok),u.id,Date.now()+7*DAY);
 s.setHeader('Set-Cookie',`sid=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7*86400}${PROD?'; Secure':''}`)}
function auth(q,s,n){const t=cookies(q).sid;if(t){const u=D.db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.token=? AND s.exp>?').get(sha(t),Date.now());if(u){q.user=u;q.tok=sha(t);return n()}}n(new HE(401,'Please log in.'))}
const need=(...r)=>(q,s,n)=>r.includes(q.user.role)?n():n(new HE(403,'You do not have permission to do that.'));
const STAFF=need('admin','staff'),pub=u=>({id:u.id,name:u.name,email:u.email,role:u.role,cid:u.cid});
const tries=new Map();
function limit(q){const now=Date.now(),t=(tries.get(q.ip)||[]).filter(x=>now-x<9e5);if(t.length>=10)throw new HE(429,'Too many attempts. Try again in a few minutes.');t.push(now);tries.set(q.ip,t)}
const OTP_TTL=10*60e3,OTP_MAX_ATTEMPTS=5;
const otpCode=()=>String(crypto.randomInt(0,1000000)).padStart(6,'0');
async function issueOtp(email,purpose,payload=null){
 const code=otpCode();
 D.db.prepare('INSERT INTO auth_otps(email,purpose,code_hash,payload,exp,attempts) VALUES(?,?,?,?,?,0) ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,payload=excluded.payload,exp=excluded.exp,attempts=0').run(email,purpose,sha(code),payload?JSON.stringify(payload):null,Date.now()+OTP_TTL);
 try{await sendOtp(email,code,purpose)}catch(e){D.db.prepare('DELETE FROM auth_otps WHERE email=? AND purpose=?').run(email,purpose);D.log(`OTP email failed for ${purpose}: ${e.message}`);throw new HE(503,'We could not send the verification email. Please try again later.')}
}
function consumeOtp(email,purpose,code){
 const r=D.db.prepare('SELECT * FROM auth_otps WHERE email=? AND purpose=?').get(email,purpose);
 if(!r||r.exp<Date.now()){if(r)D.db.prepare('DELETE FROM auth_otps WHERE email=? AND purpose=?').run(email,purpose);throw bad('That code is invalid or has expired.')}
 if(r.attempts>=OTP_MAX_ATTEMPTS)throw bad('Too many incorrect attempts. Request a new code.');
 D.db.prepare('UPDATE auth_otps SET attempts=attempts+1 WHERE email=? AND purpose=?').run(email,purpose);
 if(!eq(r.code_hash,sha(str(code,20))))throw bad('That code is invalid or has expired.');
 D.db.prepare('DELETE FROM auth_otps WHERE email=? AND purpose=?').run(email,purpose);
 return r;
}
const api=express.Router();app.use('/api',api);
/* ---- accounts ---- */
api.post('/login',wrap((q,s)=>{limit(q);const u=D.db.prepare('SELECT * FROM users WHERE email=?').get(str(q.body.email).toLowerCase());
 if(!u||!eq(u.hash,D.hashPw(String(q.body.pw||''),u.salt)))throw new HE(401,'Email or password is incorrect.');tries.delete(q.ip);session(s,u);return{user:pub(u)}}));
api.post('/register',wrap(async q=>{const em=str(q.body.email).toLowerCase(),name=str(q.body.name);
 if(!name)throw bad('Name is required.');if(!EMAIL.test(em))throw bad('Enter a valid email address.');if(!D.pwOk(q.body.pw))throw bad(PWMSG);
 if(D.db.prepare('SELECT 1 FROM users WHERE email=?').get(em)||D.db.prepare("SELECT 1 FROM customers WHERE lower(json_extract(data,'$.email'))=?").get(em))throw bad('An account with this email already exists.');
 const salt=D.uid(),hash=D.hashPw(q.body.pw,salt),cid=D.uid();
 await issueOtp(em,'register',{name,salt,hash,cid});
 return{pending:true,message:'A verification code has been sent to your email.'}}));
api.post('/verify-registration',wrap(async(q,s)=>{const em=str(q.body.email).toLowerCase(),r=consumeOtp(em,'register',q.body.tok),p=JSON.parse(r.payload);
 const u=D.tx(()=>{D.put('customers',{id:p.cid,name:p.name,email:em,phone:'',address:''});return D.makeUserFromHash(p.name,em,p.salt,p.hash,'customer',p.cid)});
 session(s,u);return{user:pub(u)}}));
api.post('/forgot',wrap(async q=>{limit(q);const em=str(q.body.email).toLowerCase(),exists=!!D.db.prepare('SELECT 1 FROM users WHERE email=?').get(em);
 if(exists)await issueOtp(em,'reset');return{ok:true,message:'If that email is registered, a verification code has been sent.'}}));
api.post('/reset',wrap(q=>{limit(q);const em=str(q.body.email).toLowerCase(),r=consumeOtp(em,'reset',q.body.tok);
 if(!D.pwOk(q.body.pw))throw bad(PWMSG);
 D.tx(()=>{const salt=D.uid();D.db.prepare('UPDATE users SET salt=?,hash=? WHERE email=?').run(salt,D.hashPw(q.body.pw,salt),em);D.db.prepare('DELETE FROM sessions WHERE uid=(SELECT id FROM users WHERE email=?)').run(em)});return{ok:true}}));
api.post('/log',wrap(q=>{D.log('client: '+str(q.body.msg,300));return{ok:1}}));
api.get('/me',auth,wrap(q=>({user:pub(q.user)})));
api.post('/logout',auth,wrap((q,s)=>{D.db.prepare('DELETE FROM sessions WHERE token=?').run(q.tok);s.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');return{ok:1}}));
/* ---- data for the signed-in role ---- */
api.get('/bootstrap',auth,wrap(q=>{const u=q.user,cu=u.role=='customer',o={};
 for(const c of ['products','plans','taxes','discounts'])o[c]=D.all(c);
 if(!cu){o.templates=D.all('templates');o.customers=D.all('customers').map(({paymentMethod,...c})=>c);o.subscriptions=[];o.subscriptionSummary=subscriptionSummary();o.subscriptionEvents=D.db.prepare('SELECT id,subscription_id subscriptionId,type,occurred_at occurredAt,actor_id actorId,details FROM subscription_events ORDER BY id').all().map(e=>({...e,details:JSON.parse(e.details)}));o.invoices=D.all('invoices');o.payments=D.all('payments');
  o.users=u.role=='admin'?D.db.prepare("SELECT id,name,email,role FROM users WHERE role='staff'").all():[]}
 else{const w="json_extract(data,'$.customerId')=?";o.templates=[];o.users=[];o.customers=D.all('customers','id=?',u.cid);o.subscriptions=[];o.subscriptionSummary=subscriptionSummary(u.cid);o.subscriptionEvents=D.db.prepare("SELECT e.id,e.subscription_id subscriptionId,e.type,e.occurred_at occurredAt,e.actor_id actorId,e.details FROM subscription_events e JOIN subscriptions s ON s.id=e.subscription_id WHERE json_extract(s.data,'$.customerId')=? ORDER BY e.id").all(u.cid).map(e=>({...e,details:JSON.parse(e.details)}));
  o.invoices=D.all('invoices',w+" AND json_extract(data,'$.status')!='Draft'",u.cid);o.payments=D.all('payments',"json_extract(data,'$.invoiceId') IN (SELECT id FROM invoices WHERE "+w+")",u.cid)}
 const sums={};D.db.prepare("SELECT json_extract(data,'$.invoiceId') k,SUM(json_extract(data,'$.amount')) s FROM payments GROUP BY k").all().forEach(r=>sums[r.k]=r.s);
 o.invoices.forEach(i=>i.paid=BL.r2(sums[i.id]||0));return o}));
function subscriptionScope(cid){return cid?{sql:"json_extract(s.data,'$.customerId')=? AND COALESCE(json_extract(s.data,'$.archived'),0)=0",params:[cid]}:{sql:"COALESCE(json_extract(s.data,'$.archived'),0)=0",params:[]}}
function subscriptionSummary(cid){const scope=subscriptionScope(cid),rows=D.db.prepare(`SELECT json_extract(s.data,'$.status') status,COUNT(*) count FROM subscriptions s WHERE ${scope.sql} GROUP BY json_extract(s.data,'$.status')`).all(...scope.params),byStatus={};rows.forEach(r=>byStatus[r.status]=r.count);return{total:rows.reduce((n,r)=>n+r.count,0),byStatus}}
api.get('/subscriptions',auth,wrap(q=>{const scope=subscriptionScope(q.user.role=='customer'?q.user.cid:null),page=Math.max(1,Math.min(100000,+q.query.page||1)),pageSize=Math.max(1,Math.min(100,+q.query.pageSize||25)),status=str(q.query.status,20),search=str(q.query.q,100),from=str(q.query.from,10),to=str(q.query.to,10),sort=str(q.query.sort,20)||'next',order=q.query.order=='desc'?'DESC':'ASC';
 const filters=[scope.sql],params=[...scope.params];if(status){filters.push("json_extract(s.data,'$.status')=?");params.push(status)}if(search){filters.push("(lower(json_extract(s.data,'$.number')) LIKE lower(?) OR lower(json_extract(c.data,'$.name')) LIKE lower(?) OR lower(json_extract(p.data,'$.name')) LIKE lower(?) OR lower(json_extract(s.data,'$.status')) LIKE lower(?))");const pattern='%'+search+'%';params.push(pattern,pattern,pattern,pattern)}if(isDate(from)){filters.push("json_extract(s.data,'$.start')>=?");params.push(from)}if(isDate(to)){filters.push("json_extract(s.data,'$.start')<=?");params.push(to)}
 const sortBy={number:"json_extract(s.data,'$.number')",customer:"json_extract(c.data,'$.name')",plan:"json_extract(p.data,'$.name')",start:"json_extract(s.data,'$.start')",expiry:"json_extract(s.data,'$.expiry')",next:"json_extract(s.data,'$.next')",status:"json_extract(s.data,'$.status')"}[sort]||"json_extract(s.data,'$.next')",where=filters.join(' AND '),rowParams=[...params,pageSize,(page-1)*pageSize];
 const rows=D.db.prepare(`SELECT s.data FROM subscriptions s LEFT JOIN customers c ON c.id=json_extract(s.data,'$.customerId') LEFT JOIN plans p ON p.id=json_extract(s.data,'$.planId') WHERE ${where} ORDER BY ${sortBy} IS NULL,${sortBy} ${order},s.rowid LIMIT ? OFFSET ?`).all(...rowParams).map(r=>JSON.parse(r.data));
 const summaryRows=D.db.prepare(`SELECT json_extract(s.data,'$.status') status,COUNT(*) count FROM subscriptions s LEFT JOIN customers c ON c.id=json_extract(s.data,'$.customerId') LEFT JOIN plans p ON p.id=json_extract(s.data,'$.planId') WHERE ${where} GROUP BY json_extract(s.data,'$.status')`).all(...params),byStatus={};summaryRows.forEach(r=>byStatus[r.status]=r.count);return{page,pageSize,rows,summary:{total:summaryRows.reduce((n,r)=>n+r.count,0),byStatus}}}));
api.put('/customer/profile',auth,need('customer'),wrap(q=>{const b=q.body,em=str(b.email).toLowerCase(),name=str(b.name);
 if(!name)throw bad('Name is required.');if(!EMAIL.test(em))throw bad('Enter a valid email address.');
 if(D.db.prepare('SELECT 1 FROM users WHERE email=? AND id!=?').get(em,q.user.id)||
    D.db.prepare("SELECT 1 FROM customers WHERE lower(json_extract(data,'$.email'))=? AND id!=? AND COALESCE(json_extract(data,'$.archived'),0)=0").get(em,q.user.cid))throw bad('That email already belongs to another account.');
 const customer=D.get('customers',q.user.cid);if(!customer)throw nf('Customer profile not found.');
 const updated=D.tx(()=>{D.put('customers',{...customer,name,email:em,phone:str(b.phone,100),address:str(b.address,500)});D.db.prepare('UPDATE users SET name=?,email=? WHERE id=?').run(name,em,q.user.id);return D.db.prepare('SELECT * FROM users WHERE id=?').get(q.user.id)});
 return{msg:'Billing profile updated.',user:pub(updated)}}));
api.put('/customer/payment-method',auth,need('customer'),wrap(q=>{const b=q.body,brands=['Visa','Mastercard','American Express','Other'];
 const last4=typeof b.last4=='string'?b.last4.trim():'',expiry=typeof b.expiry=='string'?b.expiry.trim():'',brand=str(b.brand,30);if(!brands.includes(brand)||!/^\d{4}$/.test(last4)||! /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry))throw bad('Enter valid payment-method details.');
 const c=D.get('customers',q.user.cid);if(!c)throw nf('Customer profile not found.');D.put('customers',{...c,paymentMethod:{brand,last4,expiry}});return{msg:'Payment method saved (demo metadata only).'}}));
api.delete('/customer/payment-method',auth,need('customer'),wrap(q=>{const c=D.get('customers',q.user.cid);if(!c)throw nf('Customer profile not found.');delete c.paymentMethod;D.put('customers',c);return{msg:'Saved payment method removed.'}}));
/* ---- master data (generic, role-checked, whitelisted) ---- */
const W={customers:['admin','staff'],products:['admin'],plans:['admin'],templates:['admin','staff'],taxes:['admin'],discounts:['admin']};
const FLD={customers:['name','email','phone','address'],products:['name','type','sales','cost','notes'],plans:['name','price','freq','minQty','from','to','autoClose','allowEarly','allowPause','allowRenew'],templates:['name','planId','validity'],taxes:['name','rate'],discounts:['name','type','value','minAmount','minQty','from','to','max','appliesTo','active']};
const NUM=new Set(['sales','cost','price','minQty','rate','value','minAmount','max','validity']),YNF=new Set(['autoClose','allowEarly','allowPause','allowRenew','active']);
function cleanLines(ls){if(!Array.isArray(ls)||!ls.length||ls.length>100)throw bad('Add between 1 and 100 product lines.');
 return ls.map(l=>{const p=D.get('products',String(l.productId));if(!p)throw bad('A line refers to an unknown product.');const v=str(l.variant,60);
  if(v&&!(p.variants||[]).some(x=>x.name==v))throw bad(`Unknown variant "${v}" for ${p.name}.`);const qty=+l.qty,price=+l.price;
  if(!(qty>0)||!(price>=0))throw bad('Quantity must be above zero and price cannot be negative.');
  const tid=str(l.taxId,40);if(tid&&!D.get('taxes',tid))throw bad('A line refers to an unknown tax.');return{productId:p.id,variant:v,name:p.name+(v?` (${v})`:''),qty,price,taxId:tid}})}
function clean(c,b,id){const o={};for(const k of FLD[c]){let v=b[k];if(v===undefined)continue;o[k]=NUM.has(k)?(+v||0):YNF.has(k)?(v=='yes'?'yes':'no'):str(v,500)}
 if(!o.name)throw bad('Name is required.');
 if(c=='customers'){if(!EMAIL.test(o.email||''))throw bad('Enter a valid email address.');
  if(D.db.prepare("SELECT 1 FROM customers WHERE lower(json_extract(data,'$.email'))=? AND id!=? AND COALESCE(json_extract(data,'$.archived'),0)=0").get(o.email.toLowerCase(),id||''))throw bad('That email already belongs to a customer.')}
 if(c=='products')o.variants=(Array.isArray(b.variants)?b.variants:[]).slice(0,50).map(v=>({name:str(v.name,60),extra:+v.extra||0})).filter(v=>v.name);
 if(c=='templates'){if(!D.get('plans',o.planId))throw bad('Choose a valid plan.');o.lines=cleanLines(b.lines)}
 if(c=='plans'){if(!['daily','weekly','monthly','yearly'].includes(o.freq))throw bad('Choose a billing frequency.');if((o.from&&!isDate(o.from))||(o.to&&!isDate(o.to)))throw bad('Enter valid availability dates.')}
 if(c=='discounts'){if(!['percent','fixed'].includes(o.type))throw bad('Choose a discount type.');if(o.appliesTo!='all'&&!D.get('products',o.appliesTo))throw bad('Choose what the discount applies to.');if(o.value<=0)throw bad('Discount value must be above zero.')}
 return o}
const chk=(q,c)=>{if(!W[c])throw nf();if(!W[c].includes(q.user.role))throw new HE(403,'You do not have permission to do that.')};
api.post('/c/:c',auth,wrap(q=>{const c=q.params.c;chk(q,c);const r={id:D.uid(),...clean(c,q.body)};if(c=='discounts')r.used=0;D.put(c,r);return{msg:'Saved.'}}));
api.put('/c/:c/:id',auth,wrap(q=>{const c=q.params.c;chk(q,c);const old=D.get(c,q.params.id);if(!old)throw nf();D.put(c,{...old,...clean(c,q.body,old.id)});return{msg:'Saved.'}}));
api.delete('/c/:c/:id',auth,wrap(q=>{const c=q.params.c;chk(q,c);const old=D.get(c,q.params.id);if(!old)throw nf();D.put(c,{...old,archived:true});return{msg:'Archived.'}}));
/* ---- subscriptions ---- */
function subInput(b){const o={customerId:str(b.customerId,40),planId:str(b.planId,40),start:str(b.start,10),expiry:str(b.expiry,10),terms:str(b.terms,20)};
 const p=D.get('plans',o.planId);if(!p||p.archived)throw bad('Choose a valid plan.');if(!D.get('customers',o.customerId))throw bad('Choose a valid customer.');
 if(!isDate(o.start)||!isDate(o.expiry))throw bad('Enter valid dates.');if(o.expiry<=o.start)throw bad('Expiry must be after the start date.');
 if(!['Immediate','Net 15','Net 30'].includes(o.terms))throw bad('Choose payment terms.');o.lines=cleanLines(b.lines);
 if(o.lines.reduce((a,l)=>a+l.qty,0)<(p.minQty||0))throw bad(`This plan needs a total quantity of at least ${p.minQty}.`);
 if((p.from&&o.start<p.from)||(p.to&&o.start>p.to))throw bad(`This plan is only available ${p.from||'any time'} to ${p.to||'any time'}.`);return o}
api.post('/subscriptions',auth,STAFF,wrap(q=>{const o=subInput(q.body);D.tx(()=>{const s={id:D.uid(),number:'SUB-'+String(D.seq('sub')).padStart(4,'0'),...o,status:'Draft',paused:false,next:null};D.put('subscriptions',s);D.addSubEvent(s.id,'Created',q.user.id)});return{msg:'Subscription created.'}}));
api.put('/subscriptions/:id',auth,STAFF,wrap(q=>{const s=D.get('subscriptions',q.params.id);if(!s)throw nf();if(!['Draft','Quotation'].includes(s.status))throw bad('Only draft or quotation subscriptions can be edited.');D.put('subscriptions',{...s,...subInput(q.body)});return{msg:'Saved.'}}));
api.post('/subscriptions/:id/action',auth,STAFF,wrap(q=>D.tx(()=>{const s=D.get('subscriptions',q.params.id);if(!s)throw nf('Subscription not found.');const p=D.get('plans',s.planId)||{},t=today(),x=q.body.x;let msg='Updated.',event=null,details={};
 const is=(...a)=>{if(!a.includes(s.status))throw bad(`That is not possible while the subscription is ${s.status}.`)};
 if(x=='quote'){is('Draft');s.status='Quotation';s.validUntil=BL.addD(t,15);event='Quoted'}
 else if(x=='confirm'){is('Quotation');if(s.validUntil&&s.validUntil<t)throw bad('This quotation expired on '+s.validUntil+'.');s.status='Confirmed';event='Confirmed';msg='Quotation converted to a subscription.'}
 else if(x=='activate'){is('Confirmed');s.status='Active';s.next=s.next||s.start;event='Activated';msg='Subscription is active.'}
 else if(x=='pause'){is('Active');if(p.allowPause!='yes')throw bad('This plan does not allow pausing.');s.paused=true;event='Paused'}
 else if(x=='resume'){is('Active');s.paused=false;event='Resumed'}
 else if(x=='renew'){is('Active');if(p.allowRenew!='yes')throw bad('This plan does not allow renewal.');const oldExpiry=s.expiry;s.expiry=BL.addD(s.expiry,Math.max(1,BL.days(s.start,s.expiry)));s.request=null;event='Renewed';details={from:oldExpiry,to:s.expiry};msg='Renewed until '+s.expiry+'.'}
 else if(x=='change-plan'){is('Active');const r=s.changeRequest;if(!r||r.status!='Pending')throw bad('There is no pending plan change request.');const next=D.get('plans',r.toPlanId);if(!next||next.archived)throw bad('The requested plan is no longer available.');s.planId=next.id;s.changeRequest={...r,status:'Approved',approvedAt:t};event='Plan changed';details={fromPlanId:r.fromPlanId,toPlanId:next.id}}
 else if(x=='close'){is('Active');if(s.expiry>t&&p.allowEarly!='yes')throw bad('This plan does not allow early closure.');const wasCancellation=s.request=='Cancellation';s.status='Closed';s.closed=t;s.request=null;event=wasCancellation?'Cancelled':'Closed';msg='Subscription closed.'}
 else throw bad('Unknown action.');
 D.put('subscriptions',s);if(event)D.addSubEvent(s.id,event,q.user.id,details);return{msg}})));
api.post('/subscriptions/:id/request',auth,need('customer'),wrap(q=>{const s=D.get('subscriptions',q.params.id);if(!s||s.customerId!=q.user.cid)throw nf();const t=q.body.x;
 if(!['Renewal','Cancellation'].includes(t))throw bad('Unknown request.');if(s.status!='Active'||s.request)throw bad('A request is already open or the subscription is not active.');s.request=t;D.put('subscriptions',s);return{msg:t+' request sent to the team.'}}));
api.post('/subscriptions/:id/change-request',auth,need('customer'),wrap(q=>{const s=D.get('subscriptions',q.params.id);if(!s||s.customerId!=q.user.cid)throw nf();const plan=D.get('plans',str(q.body.planId,40));
 if(s.status!='Active'||s.changeRequest?.status=='Pending')throw bad('This subscription cannot be changed right now.');
 if(!plan||plan.archived||plan.id==s.planId)throw bad('Choose a different active plan.');
 s.changeRequest={fromPlanId:s.planId,toPlanId:plan.id,note:str(q.body.note,300),requestedAt:today(),status:'Pending'};D.put('subscriptions',s);return{msg:'Plan change request submitted.'}}));
api.post('/templates/:id/quote',auth,STAFF,wrap(q=>{const t=D.get('templates',q.params.id);if(!t)throw nf();const start=str(q.body.start,10);if(!isDate(start)||!D.get('customers',str(q.body.customerId,40)))throw bad('Choose a customer and a valid start date.');
 D.tx(()=>{const s={id:D.uid(),number:'SUB-'+String(D.seq('sub')).padStart(4,'0'),customerId:q.body.customerId,planId:t.planId,start,expiry:BL.addM(start,12),terms:'Net 15',status:'Quotation',validUntil:BL.addD(today(),+t.validity||15),paused:false,next:null,lines:t.lines};D.put('subscriptions',s);D.addSubEvent(s.id,'Created',q.user.id);D.addSubEvent(s.id,'Quoted',q.user.id)});return{msg:'Quotation created.'}}));
/* ---- billing, invoices, payments ---- */
api.post('/billing/run',auth,STAFF,wrap(()=>({n:runBilling()})));
api.post('/invoices/:id/:x',auth,STAFF,wrap(q=>D.tx(()=>{const i=D.get('invoices',q.params.id);if(!i)throw nf();const x=q.params.x;let msg='Updated.';
 if(x=='confirm'){if(i.status!='Draft')throw bad('Only draft invoices can be confirmed.');i.status='Confirmed';msg='Invoice confirmed.'}
 else if(x=='cancel'){if(!['Draft','Confirmed'].includes(i.status)||D.paidOf(i.id)>0)throw bad('This invoice cannot be cancelled.');i.status='Cancelled';msg='Invoice cancelled.'}
 else if(x=='send'){if(!['Confirmed','Paid'].includes(i.status))throw bad('Confirm the invoice before sending it.');i.sent=true;const c=D.get('customers',i.customerId)||{};console.log(`[email] Invoice ${i.number} -> ${c.email}`);msg=`Invoice ${i.number} queued for ${c.email}. (Emails print to the server console until SMTP is connected.)`}
 else throw bad('Unknown action.');
 D.put('invoices',i);return{msg}})));
api.post('/payments',auth,STAFF,wrap(q=>D.tx(()=>{const b=q.body,i=D.get('invoices',str(b.invoiceId,40)),a=BL.r2(+b.amount);if(!i)throw nf('Invoice not found.');
 if(i.status!='Confirmed')throw bad('Only confirmed invoices can receive payments.');const owed=BL.r2(i.total-D.paidOf(i.id));
 if(!(a>0))throw bad('Enter an amount above zero.');if(a>owed+.005)throw bad(`That is more than the outstanding ${owed}.`);if(!isDate(str(b.date,10)))throw bad('Enter a valid date.');
 const method=str(b.method,30);if(!['Bank transfer','UPI','Card','Cash','Cheque'].includes(method))throw bad('Choose a payment method.');
 D.put('payments',{id:D.uid(),invoiceId:i.id,method,amount:a,date:b.date,note:str(b.note,300),by:q.user.id});
 if(BL.r2(owed-a)<=.005){i.status='Paid';D.put('invoices',i)}return{msg:'Payment recorded.'}})));
/* ---- staff, logs, backup ---- */
api.post('/staff',auth,need('admin'),wrap(q=>{const em=str(q.body.email).toLowerCase(),name=str(q.body.name);if(!name||!EMAIL.test(em))throw bad('Enter a name and a valid email.');if(!D.pwOk(q.body.pw))throw bad(PWMSG);
 if(D.db.prepare('SELECT 1 FROM users WHERE email=?').get(em))throw bad('That email is already registered.');D.makeUser(name,em,q.body.pw,'staff');return{msg:'Staff account created.'}}));
api.delete('/staff/:id',auth,need('admin'),wrap(q=>{D.db.prepare("DELETE FROM users WHERE id=? AND role='staff'").run(q.params.id);return{msg:'Staff account removed.'}}));
api.get('/logs',auth,need('admin'),wrap(()=>({logs:D.db.prepare('SELECT t,msg FROM logs ORDER BY id DESC LIMIT 20').all().map(r=>r.t+' '+r.msg)})));
api.get('/backup',auth,need('admin'),(q,s)=>{const o={exported:new Date().toISOString()};D.COLL.forEach(c=>o[c]=D.all(c));o.subscriptionEvents=D.db.prepare('SELECT id,subscription_id subscriptionId,type,occurred_at occurredAt,actor_id actorId,details FROM subscription_events ORDER BY id').all().map(e=>({...e,details:JSON.parse(e.details)}));o.users=D.db.prepare('SELECT id,name,email,role,cid FROM users').all();
 s.setHeader('Content-Disposition','attachment; filename="brightloop-backup.json"');s.json(o)});
api.use((q,s,n)=>n(nf()));
app.use(express.static(path.join(__dirname,'public')));app.use('/shared',express.static(path.join(__dirname,'shared')));
app.use((e,q,s,n)=>{const st=e.s||e.status||500;if(st>=500)D.log(e.stack||e.message);s.status(st).json({error:e instanceof HE?e.message:st>=500?'Server error. It has been logged.':'Bad request.'})});
/* ---- background jobs: automatic billing and daily database copy ---- */
const BK=path.join(process.env.DATA_DIR||path.join(__dirname,'data'),'backups');
async function backup(){try{fs.mkdirSync(BK,{recursive:true});const f=path.join(BK,`brightloop-${today()}.db`);if(!fs.existsSync(f))D.db.exec("VACUUM INTO '"+f.replace(/'/g,"''")+"'");fs.readdirSync(BK).sort().slice(0,-7).forEach(x=>fs.unlinkSync(path.join(BK,x)))}catch(e){D.log('backup failed: '+e.message)}}
const bill=()=>{try{const n=runBilling();if(n)console.log(`[billing] ${n} invoice(s) generated`)}catch(e){D.log('billing failed: '+e.message)}};
bill();backup();setInterval(bill,60000).unref();setInterval(backup,6*36e5).unref();
setInterval(()=>D.db.prepare('DELETE FROM sessions WHERE exp<?').run(Date.now()),36e5).unref();
if(require.main===module)app.listen(PORT,()=>console.log(`Brightloop running at http://localhost:${PORT}`));
module.exports=app;
