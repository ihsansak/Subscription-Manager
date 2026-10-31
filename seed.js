const D=require('./db'),BL=require('./shared/pricing');
module.exports=function seed(){
 if(D.db.prepare('SELECT COUNT(*) n FROM users').get().n)return;
 const ae=process.env.ADMIN_EMAIL||'admin@brightloop.com',ap=process.env.ADMIN_PASSWORD||'Admin@1234';
 if(!D.pwOk(ap))throw new Error('ADMIN_PASSWORD must have 9+ characters with upper, lower and a special character.');
 D.tx(()=>{D.makeUser('Admin',ae,ap,'admin');
  if(process.env.SEED_DEMO==='0')return;
  const t=new Date().toISOString().slice(0,10),y=+t.slice(0,4),N={p1:'Brightloop CRM',p2:'Analytics Add-on',p3:'Priority Support'};
  const L=(p,v,q,pr,tx)=>({productId:p,variant:v,name:N[p]+(v?` (${v})`:''),qty:q,price:pr,taxId:tx});
  D.makeUser('Sam Staff','staff@brightloop.com','Staff@1234','staff');D.makeUser('Acme Traders','acme@example.com','Acme@1234','customer','c1');
  [{id:'c1',name:'Acme Traders',email:'acme@example.com',phone:'9876500001',address:'12 Market Road, Kochi'},{id:'c2',name:'Northwind Retail',email:'accounts@northwind.test',phone:'9876500002',address:'4 Lake View, Bengaluru'}].forEach(x=>D.put('customers',x));
  [{id:'t1',name:'GST 18%',rate:18},{id:'t2',name:'GST 5%',rate:5}].forEach(x=>D.put('taxes',x));
  [{id:'p1',name:N.p1,type:'Software',sales:2000,cost:800,notes:'Core CRM seat',variants:[{name:'Odoo',extra:560},{name:'Zoho',extra:300}]},{id:'p2',name:N.p2,type:'Add-on',sales:500,cost:150,notes:'',variants:[]},{id:'p3',name:N.p3,type:'Service',sales:1000,cost:400,notes:'',variants:[]}].forEach(x=>D.put('products',x));
  [{id:'pl1',name:'CRM Monthly',price:2000,freq:'monthly',minQty:1,from:y+'-01-01',to:(y+2)+'-12-31',autoClose:'yes',allowEarly:'yes',allowPause:'yes',allowRenew:'yes'},{id:'pl2',name:'CRM Yearly',price:20000,freq:'yearly',minQty:5,from:y+'-01-01',to:(y+2)+'-12-31',autoClose:'no',allowEarly:'no',allowPause:'no',allowRenew:'yes'}].forEach(x=>D.put('plans',x));
  D.put('discounts',{id:'d1',name:'Volume 10%',type:'percent',value:10,minAmount:0,minQty:5,from:'',to:'',max:100,used:0,appliesTo:'all',active:'yes'});
  D.put('templates',{id:'tp1',name:'Starter bundle',planId:'pl1',validity:15,lines:[L('p1','Odoo',3,2560,'t1'),L('p2','',3,500,'t1')]});
  D.put('subscriptions',{id:'s1',number:'SUB-'+String(D.seq('sub')).padStart(4,'0'),customerId:'c1',planId:'pl1',start:BL.addM(t,-2),expiry:BL.addM(t,10),terms:'Net 15',status:'Active',paused:false,next:BL.addM(t,-2),lines:[L('p1','Odoo',3,2560,'t1'),L('p2','',3,500,'t1')]});D.addSubEvent('s1','Created');D.addSubEvent('s1','Activated');
  D.put('subscriptions',{id:'s2',number:'SUB-'+String(D.seq('sub')).padStart(4,'0'),customerId:'c2',planId:'pl2',start:BL.addD(t,-5),expiry:BL.addM(t,12),terms:'Net 30',status:'Active',paused:false,next:BL.addD(t,-5),lines:[L('p1','',6,2000,'t1'),L('p3','',1,1000,'t2')]});D.addSubEvent('s2','Created');D.addSubEvent('s2','Activated')});
 console.log('Database seeded. Admin login: '+ae+(process.env.ADMIN_PASSWORD?'':' / Admin@1234 (change this!)'))};
