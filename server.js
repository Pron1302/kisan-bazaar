const express=require('express'),fs=require('fs'),path=require('path'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),crypto=require('crypto');
const app=express();app.set('trust proxy',1);app.use((req,res,next)=>req.path==='/api/photos'?next():express.json({limit:'50kb'})(req,res,next));app.use(express.static(path.join(__dirname,'public')));
const SECRET=process.env.JWT_SECRET||'dev-secret-change-me';

// ---- Storage: MONGODB_URI ho to MongoDB (permanent), warna local db.json (sirf testing) ----
let store;
async function initStore(){
  if(process.env.MONGODB_URI){
    const{MongoClient}=require('mongodb');
    const c=new MongoClient(process.env.MONGODB_URI);await c.connect();
    const d=c.db(process.env.MONGODB_DB||'kisanbazaar'),U=d.collection('users'),L=d.collection('listings'),Ph=d.collection('photos'),O=d.collection('orders');
    await U.createIndex({phone:1},{unique:true});await L.createIndex({date:-1});await O.createIndex({buyer:1});await O.createIndex({farmer:1});
    const P={projection:{_id:0}},rx=q=>new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    store={kind:'mongodb',
      userByPhone:p=>U.findOne({phone:p},P),userById:i=>U.findOne({id:i},P),
      addUser:async u=>{await U.insertOne({...u})},
      listings:q=>L.find(q?{qty:{$gt:0},$or:[{crop:rx(q)},{place:rx(q)}]}:{qty:{$gt:0}},P).sort({date:-1}).limit(200).toArray(),
      addListing:async l=>{await L.insertOne({...l})},
      listingById:i=>L.findOne({id:i},P),decQty:async(id,q)=>{await L.updateOne({id},{$inc:{qty:-q}})},
      addOrder:async o=>{await O.insertOne({...o})},orderById:i=>O.findOne({id:i},P),updateOrder:async(id,p)=>{await O.updateOne({id},{$set:p})},
      ordersFor:u=>O.find({$or:[{buyer:u},{farmer:u}]},P).sort({date:-1}).limit(100).toArray(),
      stats:async()=>Object.fromEntries((await O.aggregate([{$match:{'rating.stars':{$gt:0}}},{$group:{_id:'$farmer',avg:{$avg:'$rating.stars'},n:{$sum:1}}}]).toArray()).map(x=>[x._id,{avg:Math.round(x.avg*10)/10,n:x.n}])),
      addPhoto:async(id,data)=>{await Ph.insertOne({id,data})},getPhoto:async i=>(await Ph.findOne({id:i},P))?.data,
      delListing:async(id,owner)=>(await L.deleteOne({id,owner})).deletedCount>0};
  }else{
    const F=path.join(process.env.DATA_DIR||__dirname,'db.json');let db={users:[],listings:[],photos:{},orders:[]};
    try{db=JSON.parse(fs.readFileSync(F,'utf8'))}catch{}db.photos=db.photos||{};db.orders=db.orders||[];
    const save=()=>fs.writeFileSync(F,JSON.stringify(db));
    store={kind:'file',
      userByPhone:async p=>db.users.find(u=>u.phone===p),userById:async i=>db.users.find(u=>u.id===i),
      addUser:async u=>{db.users.push(u);save()},
      listings:async q=>db.listings.filter(l=>l.qty>0&&(!q||(l.crop+' '+l.place).toLowerCase().includes(q.toLowerCase()))).reverse().slice(0,200),
      addListing:async l=>{db.listings.push(l);save()},
      listingById:async i=>db.listings.find(l=>l.id===i),decQty:async(id,q)=>{const l=db.listings.find(x=>x.id===id);if(l){l.qty-=q;save()}},
      addOrder:async o=>{db.orders.push(o);save()},orderById:async i=>db.orders.find(o=>o.id===i),updateOrder:async(id,p)=>{Object.assign(db.orders.find(o=>o.id===id),p);save()},
      ordersFor:async u=>db.orders.filter(o=>o.buyer===u||o.farmer===u).reverse().slice(0,100),
      stats:async()=>{const m={};db.orders.filter(o=>o.rating).forEach(o=>{const x=m[o.farmer]||(m[o.farmer]={t:0,n:0});x.t+=o.rating.stars;x.n++});return Object.fromEntries(Object.entries(m).map(([k,v])=>[k,{avg:Math.round(v.t/v.n*10)/10,n:v.n}]))},
      addPhoto:async(id,data)=>{db.photos[id]=data;save()},getPhoto:async i=>db.photos[i],
      delListing:async(id,owner)=>{const i=db.listings.findIndex(l=>l.id===id&&l.owner===owner);if(i<0)return false;db.listings.splice(i,1);save();return true}};
  }
  console.log('Storage:',store.kind);
}
const getUser=req=>{try{return jwt.verify((req.headers.authorization||'').slice(7),SECRET)}catch{return null}};
const auth=(req,res,next)=>{const u=getUser(req);if(!u)return res.status(401).json({error:'E_LOGIN'});req.user=u;next()};
const s=(v,n)=>String(v||'').trim().slice(0,n);
const token=u=>jwt.sign({id:u.id,name:u.name,role:u.role},SECRET,{expiresIn:'30d'});
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(e);res.status(500).json({error:'E_SRV'})});

app.post('/api/register',wrap(async(req,res)=>{
  const{name,phone,password,role,village}=req.body||{};
  if(!/^\d{10}$/.test(s(phone,10)))return res.status(400).json({error:'E_PHONE'});
  if(s(password,100).length<6)return res.status(400).json({error:'E_PASS'});
  if(!s(name,60))return res.status(400).json({error:'E_NAME'});
  if(await store.userByPhone(phone))return res.status(400).json({error:'E_EXISTS'});
  if(otpOn()){const o=OTP.get(phone);
    if(!o||Date.now()>o.exp||++o.tries>5||o.h!==sha(String(req.body.otp||'').trim()))return res.status(400).json({error:'E_OTP'});
    OTP.delete(phone);}
  const u={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:s(name,60),phone:s(phone,10),village:s(village,80),role:role==='buyer'?'buyer':'farmer',hash:await bcrypt.hash(password,10)};
  try{await store.addUser(u)}catch{return res.status(400).json({error:'E_EXISTS'})}
  res.json({token:token(u),user:{id:u.id,name:u.name,role:u.role}});
}));
app.post('/api/login',wrap(async(req,res)=>{
  const{phone,password}=req.body||{};const u=await store.userByPhone(s(phone,10));
  if(!u||!(await bcrypt.compare(String(password||''),u.hash)))return res.status(400).json({error:'E_BAD'});
  res.json({token:token(u),user:{id:u.id,name:u.name,role:u.role}});
}));
// ---- Orders (request -> accept -> complete -> rating). Payment app ke bahar (UPI/cash): isme paisa nahi aata-jaata ----
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const pub=(o,uid)=>{const mine=o.buyer===uid,show=['accepted','done'].includes(o.status);return{...o,phone:show?(mine?o.farmerPhone:o.buyerPhone):null,farmerPhone:undefined,buyerPhone:undefined,role:mine?'buyer':'farmer'}};
app.post('/api/orders',auth,wrap(async(req,res)=>{
  if(req.user.role!=='buyer')return res.status(403).json({error:'E_BUYER'});
  const l=await store.listingById(s(req.body.listing,30)),q=+req.body.qty,b=await store.userById(req.user.id);
  if(!b)return res.status(401).json({error:'E_RELOGIN'});if(!l||!(q>0)||q>l.qty)return res.status(400).json({error:'E_QTY'});
  const o={id:rid(),listing:l.id,crop:l.crop,farmer:l.owner,farmerName:l.farmer,farmerPhone:l.phone,buyer:b.id,buyerName:b.name,buyerPhone:b.phone,qty:q,price:l.price,status:'pending',rating:null,date:new Date().toISOString()};
  await store.addOrder(o);res.json(pub(o,b.id));
}));
app.get('/api/orders',auth,wrap(async(req,res)=>res.json((await store.ordersFor(req.user.id)).map(o=>pub(o,req.user.id)))));
app.post('/api/orders/:id/:act',auth,wrap(async(req,res)=>{
  const o=await store.orderById(s(req.params.id,30));
  if(!o||(o.buyer!==req.user.id&&o.farmer!==req.user.id))return res.status(404).json({error:'E_NF'});
  const isF=o.farmer===req.user.id,a=req.params.act,st=o.status,set=p=>store.updateOrder(o.id,p);
  if(isF&&a==='accept'&&st==='pending'){const l=await store.listingById(o.listing);if(!l||l.qty<o.qty)return res.status(400).json({error:'E_QTY'});await set({status:'accepted'})}
  else if(isF&&a==='reject'&&st==='pending')await set({status:'rejected'});
  else if(isF&&a==='done'&&st==='accepted'){await set({status:'done'});await store.decQty(o.listing,o.qty)}
  else if(!isF&&a==='cancel'&&(st==='pending'||st==='accepted'))await set({status:'cancelled'});
  else if(!isF&&a==='rate'&&st==='done'&&!o.rating){const n=Math.round(+req.body.stars);if(!(n>=1&&n<=5))return res.status(400).json({error:'E_DETAILS'});await set({rating:{stars:n,text:s(req.body.text,200)}})}
  else return res.status(400).json({error:'E_ORDER'});
  res.json({ok:true});
}));
// ---- OTP: FAST2SMS_KEY set ho to SMS se; OTP_DEV=1 sirf testing (OTP response me dikhta hai); dono na ho to OTP band ----
const OTP=new Map(),IPH=new Map(),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const otpOn=()=>!!(process.env.FAST2SMS_KEY||process.env.OTP_DEV);
app.get('/api/config',(q,r)=>r.json({otp:otpOn()}));
app.post('/api/otp/send',wrap(async(req,res)=>{
  const phone=s(req.body&&req.body.phone,10),now=Date.now();
  if(!/^\d{10}$/.test(phone))return res.status(400).json({error:'E_PHONE'});
  if(!otpOn())return res.json({skipped:true});
  const o=OTP.get(phone),ip=req.ip,h=(IPH.get(ip)||[]).filter(t=>now-t<3600e3);
  if((o&&now-o.sent<30000)||h.length>=10)return res.status(429).json({error:'E_WAIT'});
  if(await store.userByPhone(phone))return res.status(400).json({error:'E_EXISTS'});
  if(OTP.size>5000)OTP.clear();if(IPH.size>5000)IPH.clear();
  const code=String(crypto.randomInt(100000,1000000));
  OTP.set(phone,{h:sha(code),exp:now+300000,sent:now,tries:0});IPH.set(ip,[...h,now]);
  if(process.env.FAST2SMS_KEY){
    const r=await fetch('https://www.fast2sms.com/dev/bulkV2',{method:'POST',headers:{authorization:process.env.FAST2SMS_KEY,'Content-Type':'application/json'},body:JSON.stringify({route:'otp',variables_values:code,numbers:phone})});
    const j=await r.json().catch(()=>({}));if(!r.ok||j.return===false){OTP.delete(phone);return res.status(502).json({error:'E_SMS'})}
    return res.json({sent:true});
  }
  console.log('DEV OTP',phone,code);res.json({sent:true,dev:code});
}));
// ---- Photos: client 800px JPEG me compress karke bhejta hai, DB me save hoti hai ----
app.post('/api/photos',auth,express.json({limit:'600kb'}),wrap(async(req,res)=>{
  const d=String(req.body&&req.body.data||'');
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d)||d.length>450000)return res.status(400).json({error:'E_PHOTO'});
  const id=crypto.randomBytes(9).toString('hex');await store.addPhoto(id,d.split(',')[1]);res.json({id});
}));
app.get('/api/photo/:id',wrap(async(req,res)=>{
  const b=await store.getPhoto(s(req.params.id,30));if(!b)return res.status(404).end();
  res.set({'Content-Type':'image/jpeg','Cache-Control':'public,max-age=31536000,immutable'}).send(Buffer.from(b,'base64'));
}));
app.get('/api/listings',wrap(async(req,res)=>{
  const logged=!!getUser(req);
  const[ls,st]=await Promise.all([store.listings(s(req.query.q,40)),store.stats()]);
  res.json(ls.map(l=>({...l,phone:logged?l.phone:null,rating:st[l.owner]||null})));
}));
app.post('/api/listings',auth,wrap(async(req,res)=>{
  if(req.user.role!=='farmer')return res.status(403).json({error:'E_FARMER'});
  const{crop,qty,price,place,photo}=req.body||{};
  if(!s(crop,40)||!(+qty>0)||!(+price>0)||!s(place,80))return res.status(400).json({error:'E_DETAILS'});
  const u=await store.userById(req.user.id);if(!u)return res.status(401).json({error:'E_RELOGIN'});
  const l={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),owner:u.id,farmer:u.name,phone:u.phone,crop:s(crop,40),qty:+qty,price:+price,place:s(place,80),photo:s(photo,30),date:new Date().toISOString()};
  await store.addListing(l);res.json(l);
}));
app.delete('/api/listings/:id',auth,wrap(async(req,res)=>{
  if(!(await store.delListing(req.params.id,req.user.id)))return res.status(404).json({error:'E_NF'});res.json({ok:true});
}));
// Asli mandi bhav: data.gov.in Agmarknet API (env var DATA_GOV_KEY chahiye). Key na ho to sample dikhta hai.
const RES='9ef84268-d588-465a-a308-a864a43d0070',cache=new Map();
const SAMPLE=[['Wheat',2250,2500],['Paddy(Dhan)',2200,2450],['Soyabean',4300,4900],['Gram',5300,5900],['Mustard',5500,6100],['Maize',2000,2300],['Onion',1200,2400],['Potato',900,1800],['Tomato',1500,3500]]
  .map(([c,a,b])=>({state:'-',district:'-',market:'Sample',commodity:c,min_price:a,max_price:b,modal_price:Math.round((a+b)/2),arrival_date:'-'}));
app.get('/api/rates',async(req,res)=>{
  const KEY=process.env.DATA_GOV_KEY;if(!KEY)return res.json({sample:true,rates:SAMPLE});
  const state=s(req.query.state,40),commodity=s(req.query.commodity,40),ck=state+'|'+commodity,hit=cache.get(ck);
  if(hit&&Date.now()-hit.t<30*60*1000)return res.json({rates:hit.d});
  try{
    const u=new URL('https://api.data.gov.in/resource/'+RES);
    u.searchParams.set('api-key',KEY);u.searchParams.set('format','json');u.searchParams.set('limit','100');
    if(state)u.searchParams.set('filters[state]',state);if(commodity)u.searchParams.set('filters[commodity]',commodity);
    const r=await fetch(u),j=await r.json();if(!r.ok)throw new Error();
    const d=(j.records||[]).map(x=>({state:x.state,district:x.district,market:x.market,commodity:x.commodity,min_price:x.min_price,max_price:x.max_price,modal_price:x.modal_price,arrival_date:x.arrival_date}));
    cache.set(ck,{t:Date.now(),d});res.json({rates:d});
  }catch{res.status(502).json({error:'E_MANDI'})}
});
initStore().then(()=>app.listen(process.env.PORT||3000,()=>console.log('Running'))).catch(e=>{console.error('Startup failed:',e.message);process.exit(1)});
