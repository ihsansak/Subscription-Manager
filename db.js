const {DatabaseSync}=require('node:sqlite'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const DIR=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DIR,{recursive:true});
const db=new DatabaseSync(path.join(DIR,'brightloop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
const COLL=['customers','products','plans','taxes','discounts','templates','subscriptions','invoices','payments'];
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','staff','customer')),cid TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resets(email TEXT PRIMARY KEY,tok TEXT NOT NULL,exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT,t TEXT NOT NULL,msg TEXT NOT NULL);
${COLL.map(c=>`CREATE TABLE IF NOT EXISTS ${c}(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)));`).join('\n')}
CREATE TABLE IF NOT EXISTS subscription_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 subscription_id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN('Created','Quoted','Confirmed','Activated','Paused','Resumed','Renewed','Plan changed','Cancelled','Closed')),
 occurred_at TEXT NOT NULL,
 actor_id TEXT,
 details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details))
);
CREATE INDEX IF NOT EXISTS ix_sub_events ON subscription_events(subscription_id,id);
CREATE TRIGGER IF NOT EXISTS subscription_events_no_update
 BEFORE UPDATE ON subscription_events
 BEGIN SELECT RAISE(ABORT,'Subscription events are immutable.'); END;
CREATE TRIGGER IF NOT EXISTS subscription_events_no_delete
 BEFORE DELETE ON subscription_events
 BEGIN SELECT RAISE(ABORT,'Subscription events are immutable.'); END;
CREATE INDEX IF NOT EXISTS ix_sub_c ON subscriptions(json_extract(data,'$.customerId'));
CREATE INDEX IF NOT EXISTS ix_sub_s ON subscriptions(json_extract(data,'$.status'));
CREATE INDEX IF NOT EXISTS ix_inv_c ON invoices(json_extract(data,'$.customerId'));
CREATE INDEX IF NOT EXISTS ix_inv_s ON invoices(json_extract(data,'$.status'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_key ON invoices(json_extract(data,'$.key'));
CREATE INDEX IF NOT EXISTS ix_pay_i ON payments(json_extract(data,'$.invoiceId'));
CREATE INDEX IF NOT EXISTS ix_cus_e ON customers(lower(json_extract(data,'$.email')));
`);
const legacyEventType={Draft:null,Quotation:'Quoted',Confirmed:'Confirmed',Active:'Activated',Closed:'Closed'};
db.prepare('SELECT id,data FROM subscriptions').all().forEach(r=>{
 if(db.prepare('SELECT 1 FROM subscription_events WHERE subscription_id=?').get(r.id))return;
 const s=JSON.parse(r.data),type=legacyEventType[s.status];
 db.prepare('INSERT INTO subscription_events(subscription_id,type,occurred_at,details) VALUES(?,?,?,?)').run(s.id,'Created',new Date().toISOString(),'{}');
 if(type)db.prepare('INSERT INTO subscription_events(subscription_id,type,occurred_at,details) VALUES(?,?,?,?)').run(s.id,type,new Date().toISOString(),'{}');
});
const uid=()=>crypto.randomBytes(6).toString('hex');
let depth=0;
const tx=f=>{const top=depth==0;db.exec(top?'BEGIN IMMEDIATE':'SAVEPOINT s'+depth);depth++;
 try{const r=f();depth--;db.exec(top?'COMMIT':'RELEASE s'+depth);return r}
 catch(e){depth--;db.exec(top?'ROLLBACK':`ROLLBACK TO s${depth}; RELEASE s${depth}`);throw e}};
const get=(c,id)=>{const r=db.prepare(`SELECT data FROM ${c} WHERE id=?`).get(id);return r&&JSON.parse(r.data)};
const put=(c,o)=>db.prepare(`INSERT INTO ${c}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(o.id,JSON.stringify(o));
const all=(c,w,...p)=>db.prepare(`SELECT data FROM ${c}${w?' WHERE '+w:''} ORDER BY rowid`).all(...p).map(r=>JSON.parse(r.data));
const subEvents=id=>db.prepare('SELECT id,subscription_id subscriptionId,type,occurred_at occurredAt,actor_id actorId,details FROM subscription_events WHERE subscription_id=? ORDER BY id').all(id).map(e=>({...e,details:JSON.parse(e.details)}));
const addSubEvent=(subscriptionId,type,actorId=null,details={})=>db.prepare('INSERT INTO subscription_events(subscription_id,type,occurred_at,actor_id,details) VALUES(?,?,?,?,?)').run(subscriptionId,type,new Date().toISOString(),actorId,JSON.stringify(details));
const seq=k=>{db.prepare('INSERT INTO meta(k,v) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET v=v+1').run(k);return db.prepare('SELECT v FROM meta WHERE k=?').get(k).v};
const paidOf=id=>db.prepare("SELECT COALESCE(SUM(json_extract(data,'$.amount')),0) s FROM payments WHERE json_extract(data,'$.invoiceId')=?").get(id).s;
const hashPw=(p,salt)=>crypto.scryptSync(p,salt,32).toString('hex');
const pwOk=p=>typeof p=='string'&&p.length>=9&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[^A-Za-z0-9]/.test(p);
function makeUser(name,email,pw,role,cid,id){const salt=uid(),u={id:id||uid(),name,email:email.toLowerCase().trim(),salt,hash:hashPw(pw,salt),role,cid:cid||null};
 db.prepare('INSERT INTO users(id,name,email,salt,hash,role,cid) VALUES(@id,@name,@email,@salt,@hash,@role,@cid)').run(u);return u}
function log(msg){try{db.prepare('INSERT INTO logs(t,msg) VALUES(?,?)').run(new Date().toISOString(),String(msg).slice(0,500));db.prepare('DELETE FROM logs WHERE id<=(SELECT MAX(id)-200 FROM logs)').run()}catch(e){}console.error(msg)}
module.exports={db,COLL,uid,tx,get,put,all,subEvents,addSubEvent,seq,paidOf,hashPw,pwOk,makeUser,log};
