/* Warung POS — domain logic. No browser or Electron dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WPOSCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const ROLES = ['superuser', 'admin', 'kasir'];
  const MAX_MONEY = 1000000000;
  const uid = () => globalThis.crypto.randomUUID();
  const now = () => new Date().toISOString();
  const integer = (v, label, min = 0, max = MAX_MONEY) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} harus bilangan bulat ${min}–${max.toLocaleString('id-ID')}.`);
    return n;
  };
  const quantity = (v, label = 'Jumlah', allowZero = false) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < (allowZero ? 0 : 0.001) || n > 100000 || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.0001)
      throw new Error(`${label}: gunakan 0,001–100.000, maksimal 3 angka desimal.`);
    return Math.round(n * 1000) / 1000;
  };
  const text = (v, label, max = 120, required = true) => {
    const s = String(v == null ? '' : v).trim();
    if ((required && !s) || s.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw new Error(`${label} tidak valid (maksimal ${max} karakter).`);
    return s;
  };
  const dateKey = (v = new Date()) => {
    const d = typeof v === 'string' ? new Date(v) : v;
    if (Number.isNaN(d.getTime())) throw new Error('Tanggal tidak valid.');
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  function checksum(s) {
    let h = 0x811c9dc5;
    for (let i=0; i<s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8,'0');
  }
  function envelope(data) {
    const payload = JSON.stringify(data);
    return { format: 'warung-pos-backup', version: VERSION, checksum: checksum(payload), data };
  }
  const PAPERS = ['thermal','a4','continuous'], SCALES = [85,90,95,100];
  function paperOf(v){ return PAPERS.includes(v) ? v : 'thermal'; }
  function scaleOf(v){ return SCALES.includes(Number(v)) ? Number(v) : 100; }
  function emptyDB() {
    return {
      schemaVersion: VERSION, revision: 0, updatedAt: now(),
      store: { name: 'Warung Saya', address: '', phone: '', logo: '', footer: 'Terima kasih sudah berbelanja!\nBarang yang sudah dibeli mohon diperiksa kembali.' },
      printer: { name: '', paper: 'thermal', width: 58, scale: 100, mode: 'driver', autoPrint: false, silent: true, cut: true, credit: false },
      appearance: {fontScale: 1, boldText: false},
      categories: ['Sembako', 'Makanan', 'Minuman', 'Kebersihan', 'Lainnya'],
      users: [], products: [], sales: [], shifts: [], cashMoves: [], audit: [], counters: { sale: 0 }
    };
  }
  const SAMPLE_PRODUCTS = [
    ['Beras pulen 5 kg','Sembako','sak',64000,72000,18,'rice'],
    ['Minyak goreng 1 L','Sembako','pouch',16500,19500,24,'oil'],
    ['Gula pasir 1 kg','Sembako','kg',16000,18500,16,'sugar'],
    ['Telur ayam 1 kg','Sembako','kg',26000,30000,10,'eggs'],
    ['Mi goreng original','Makanan','pcs',2800,3500,40,'noodles'],
    ['Mi kuah ayam','Makanan','pcs',2700,3500,30,'noodles'],
    ['Biskuit cokelat','Makanan','pcs',7500,9500,4,'cookies'],
    ['Camilan kentang','Makanan','pcs',8500,11000,15,'snack'],
    ['Air mineral 600 ml','Minuman','botol',2500,4000,48,'water'],
    ['Teh melati 350 ml','Minuman','botol',3500,5000,24,'tea'],
    ['Kopi sachet','Minuman','saset',1500,2500,60,'coffee'],
    ['Susu UHT 1 L','Minuman','kotak',17500,21000,12,'milk'],
    ['Sabun mandi','Kebersihan','pcs',3500,5000,20,'soap'],
    ['Detergen 800 g','Kebersihan','pouch',17500,22000,3,'detergent'],
    ['Pasta gigi','Kebersihan','pcs',11500,15000,9,'paste'],
    ['Tisu gulung','Kebersihan','roll',7000,10000,14,'tissue']
  ];
  function seedProducts(db) {
    SAMPLE_PRODUCTS.forEach((p,i) => db.products.push({
      id: uid(), sku: `CN-${String(i+1).padStart(3,'0')}`, barcode: `DEMO-${String(i+1).padStart(4,'0')}`,
      name:p[0], category:p[1], unit:p[2], cost:p[3], price:p[4], stock:p[5], minStock:5,
      image:`asset:${p[6]}`, active:true, isDemo:true, createdAt:now()
    }));
  }
  function validateDB(raw) {
    if (!raw || raw.schemaVersion !== VERSION) throw new Error('Versi data tidak didukung.');
    const d = emptyDB();
    d.revision = integer(raw.revision, 'Revisi', 0, 1000000000);
    d.updatedAt = text(raw.updatedAt, 'Waktu pembaruan', 40);
    if (!raw.store || !raw.printer) throw new Error('Pengaturan toko/printer tidak lengkap.');
    d.store = {
      name:text(raw.store.name,'Nama toko',80), address:text(raw.store.address,'Alamat',240,false),
      phone:text(raw.store.phone,'Telepon',40,false), footer:text(raw.store.footer,'Ucapan nota',400,false),
      logo:imageData(raw.store.logo || '', true)
    };
    const p = raw.printer;
    if (![58,80].includes(Number(p.width)) || !['driver','raw'].includes(p.mode)) throw new Error('Konfigurasi printer tidak valid.');
    d.printer = {name:text(p.name,'Nama printer',180,false), paper:paperOf(p.paper), width:Number(p.width), mode:p.mode, autoPrint:!!p.autoPrint, silent:!!p.silent, cut:!!p.cut, credit:!!p.credit, scale:scaleOf(p.scale)};
    { const ap=raw.appearance||{}; const fs=Number(ap.fontScale===undefined?1:ap.fontScale);
      if (![1,1.125,1.25].includes(fs)) throw new Error('Ukuran huruf tidak valid.');
      d.appearance={fontScale:fs,boldText:!!ap.boldText}; }
    if (!Array.isArray(raw.categories) || raw.categories.length > 100) throw new Error('Kategori tidak valid.');
    d.categories = raw.categories.map(x=>text(x,'Kategori',40));
    if (new Set(d.categories.map(x=>x.toLowerCase())).size !== d.categories.length) throw new Error('Kategori duplikat.');
    for (const key of ['users','products','sales','shifts','cashMoves','audit']) {
      if (!Array.isArray(raw[key]) || raw[key].length > 100000) throw new Error(`Data ${key} tidak valid.`);
      d[key] = clone(raw[key]);
      const ids = new Set();
      for (const row of d[key]) {
        if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{6,80}$/.test(row.id) || ids.has(row.id)) throw new Error(`ID ${key} tidak valid/duplikat.`);
        ids.add(row.id);
      }
    }
    if (d.users.length < 1 || d.users.length > 200) throw new Error('Jumlah akun tidak valid.');
    for (const u of d.users) {
      text(u.name,'Nama pengguna',80); text(u.username,'Username',32);
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(u.username) || !ROLES.includes(u.role) || typeof u.active !== 'boolean') throw new Error('Akun tidak valid.');
      if (!/^[a-f0-9]{32}$/.test(u.salt) || !/^[a-f0-9]{128}$/.test(u.hash)) throw new Error('Sandi tersimpan tidak valid.');
    }
    if (new Set(d.users.map(u=>u.username.toLowerCase())).size !== d.users.length) throw new Error('Username duplikat.');
    if (!d.users.some(u=>u.role==='superuser' && u.active)) throw new Error('Harus ada Super User aktif.');
    const barcodes = new Set(), skus = new Set();
    for (const p of d.products) {
      text(p.name,'Nama produk',100); text(p.category,'Kategori',40); text(p.unit,'Satuan',16);
      text(p.barcode,'Barcode',64,false); text(p.sku,'Kode barang',32);
      integer(p.price,'Harga jual'); integer(p.cost,'Harga modal'); quantity(p.stock,'Stok',true); quantity(p.minStock,'Stok minimum',true);
      if (typeof p.active !== 'boolean' || typeof p.isDemo !== 'boolean') throw new Error('Status produk tidak valid.');
      p.image = imageData(p.image || '', false);
      if (p.barcode && barcodes.has(p.barcode.toLowerCase())) throw new Error('Barcode duplikat.');
      if (skus.has(p.sku.toLowerCase())) throw new Error('Kode barang duplikat.');
      if (p.barcode) barcodes.add(p.barcode.toLowerCase()); skus.add(p.sku.toLowerCase());
    }
    for (const s of d.sales) {
      if (!['completed','void'].includes(s.status) || !Array.isArray(s.items) || !s.items.length || s.items.length>1000) throw new Error('Transaksi tidak valid.');
      text(s.number,'Nomor nota',50); text(s.at,'Waktu transaksi',40); text(s.userName,'Nama kasir',80);
      if (!['Tunai','QRIS','Transfer','Kartu'].includes(s.method)) throw new Error('Metode pembayaran tidak valid.');
      let subtotal = 0, cost = 0;
      for (const i of s.items) {
        text(i.name,'Nama item',100); integer(i.price,'Harga item'); integer(i.cost,'Modal item'); quantity(i.qty);
        if (integer(i.lineTotal,'Total item') !== Math.round(i.price*i.qty)) throw new Error('Total item tidak cocok.');
        subtotal += i.lineTotal; cost += Math.round(i.cost*i.qty);
      }
      if (integer(s.subtotal,'Subtotal')!==subtotal || integer(s.discount,'Diskon',0,subtotal)!==s.discount) throw new Error('Total transaksi tidak cocok.');
      const rate=Number(s.taxRate||0);
      if (!Number.isFinite(rate)||rate<0||rate>100||Math.abs(rate*100-Math.round(rate*100))>0.001) throw new Error('Tarif PPN tidak valid.');
      s.taxRate=rate;
      const taxExpected=Math.round((subtotal-s.discount)*rate/100);
      if (integer(s.tax===undefined?taxExpected:s.tax,'PPN')!==taxExpected) throw new Error('PPN tidak cocok.');
      s.tax=taxExpected;
      if (integer(s.total,'Total')!==subtotal-s.discount+taxExpected) throw new Error('Total transaksi tidak cocok.');
      integer(s.paid,'Uang diterima'); integer(s.change,'Kembali');
      if (s.paid<s.total || s.change!==s.paid-s.total) throw new Error('Pembayaran tidak cocok.');
      if (!Number.isFinite(Date.parse(s.at))) throw new Error('Waktu transaksi tidak valid.');
    }
    for (const s of d.shifts) {
      integer(s.opening,'Modal awal');
      text(s.userName,'Nama kasir',80); text(s.openedAt,'Waktu buka kas',40);
      if (!Number.isFinite(Date.parse(s.openedAt))) throw new Error('Waktu buka kas tidak valid.');
      if (!['open','closed'].includes(s.status)) throw new Error('Status kas tidak valid.');
      if (s.status==='closed') {
        integer(s.expected,'Kas diharapkan'); integer(s.counted,'Kas dihitung');
        if (integer(s.difference,'Selisih kas',-MAX_MONEY,MAX_MONEY)!==s.counted-s.expected) throw new Error('Selisih kas tidak cocok.');
        if (!Number.isFinite(Date.parse(s.closedAt))) throw new Error('Waktu tutup kas tidak valid.');
      }
    }
    for (const m of d.cashMoves) {
      if (!['in','out'].includes(m.type)) throw new Error('Jenis kas tidak valid.'); integer(m.amount,'Nominal kas',1); text(m.note,'Catatan kas',240);
      text(m.userName,'Nama kasir',80); if (!Number.isFinite(Date.parse(m.at))) throw new Error('Waktu kas tidak valid.');
      if (typeof m.shiftId!=='string' || !/^[a-zA-Z0-9-]{6,80}$/.test(m.shiftId)) throw new Error('Kas tidak terhubung ke shift.');
    }
    for (const a of d.audit) {
      text(a.action,'Aktivitas',80); text(a.detail,'Detail aktivitas',500,false); text(a.userName,'Nama pengguna',80);
      if (!Number.isFinite(Date.parse(a.at))) throw new Error('Waktu audit tidak valid.');
    }
    {
      const numbers=new Set(), requests=new Set();
      for (const s of d.sales) {
        if (numbers.has(s.number) || requests.has(s.requestId)) throw new Error('Nomor nota / ID transaksi duplikat.');
        numbers.add(s.number); requests.add(s.requestId);
        if (s.storeSnapshot) {
          text(s.storeSnapshot.name,'Nama toko pada nota',80); text(s.storeSnapshot.footer,'Ucapan nota',400,false);
          imageData(s.storeSnapshot.logo || '', true);
        }
        if (s.status==='void') { text(s.voidReason,'Alasan pembatalan',240); if (!Number.isFinite(Date.parse(s.voidAt))) throw new Error('Waktu pembatalan tidak valid.'); }
      }
    }
    integer(raw.counters?.sale,'Nomor urut',0,1000000000); d.counters.sale=raw.counters.sale;
    if (d.counters.sale < d.sales.length) throw new Error('Nomor urut nota tidak valid.');
    return d;
  }
  function imageData(v, logo = false) {
    const s = String(v || '');
    if (!s) return '';
    if (!logo && /^asset:[a-z]{1,24}$/.test(s)) return s;
    if (s.length > (logo ? 700000 : 2200000) || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new Error('Gunakan gambar PNG/JPG/WebP yang lebih kecil.');
    return s;
  }
  function parseBackup(serialized) {
    if (typeof serialized !== 'string' || serialized.length > 90000000) throw new Error('Backup terlalu besar atau tidak valid (maksimal 90 MB).');
    let e; try { e=JSON.parse(serialized); } catch { throw new Error('File bukan backup JSON yang valid.'); }
    if (e.format !== 'warung-pos-backup' || e.version !== VERSION || checksum(JSON.stringify(e.data))!==e.checksum) throw new Error('Backup rusak atau format tidak sesuai.');
    return validateDB(e.data);
  }
  class MemoryAdapter {
    constructor(value=null) { this.value=value; }
    read() { return this.value; }
    write(value) { this.value=value; }
  }
  class Store {
    constructor(adapter, onSaved) {
      this.adapter=adapter; this.onSaved=onSaved; this.db=emptyDB();
      const raw=adapter.read(); if (raw) this.db=parseBackup(raw);
    }
    get initialized() { return this.db.users.length>0; }
    commit(mutator) {
      const next=clone(this.db); const result=mutator(next);
      next.revision++; next.updatedAt=now();
      const validated=validateDB(next);
      const serialized=JSON.stringify(envelope(validated));
      if (serialized.length>90000000) throw new Error('Penyimpanan hampir penuh. Ekspor backup dan hubungi teknisi.');
      this.adapter.write(serialized); this.db=validated;
      if (this.onSaved) this.onSaved();
      return result;
    }
    replace(data) {
      const d=validateDB(data); d.revision++; d.updatedAt=now();
      const s=JSON.stringify(envelope(d)); this.adapter.write(s); this.db=d;
    }
    serialize() { return JSON.stringify(envelope(this.db),null,2); }
  }
  function defaultHash(password, crypto) {
    const salt=crypto.randomBytes(16).toString('hex');
    return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
  }
  class Service {
    constructor(store, options={}) {
      this.store=store; this.crypto=options.crypto; this.sessions=new Map(); this.attempts=new Map();
      this.fromHex=options.fromHex || (s=>Buffer.from(s,'hex'));
      this.clock=options.clock || (()=>Date.now());
    }
    get db() { return this.store.db; }
    audit(d,u,action,detail='') {
      d.audit.unshift({id:uid(),at:now(),userId:u?.id || '',userName:u?.name || 'Sistem',action:String(action).slice(0,80),detail:String(detail).slice(0,500)});
      if (d.audit.length>5000) d.audit.length=5000;
    }
    auth(token, roles=ROLES) {
      const s=this.sessions.get(token);
      if (!s || s.expires<this.clock()) { this.sessions.delete(token); throw new Error('Sesi berakhir. Silakan masuk kembali.'); }
      const u=this.db.users.find(x=>x.id===s.userId && x.active);
      if (!u || !roles.includes(u.role)) throw new Error('Anda tidak memiliki izin untuk tindakan ini.');
      s.expires=this.clock()+12*60*60*1000; return u;
    }
    publicState(user) {
      const full=['admin','superuser'].includes(user.role);
      const shifts=full ? this.db.shifts : this.db.shifts.filter(x=>x.userId===user.id);
      const shiftIds=new Set(shifts.map(x=>x.id));
      return {
        store:clone(this.db.store), printer:clone(this.db.printer), appearance:clone(this.db.appearance||{fontScale:1,boldText:false}), categories:clone(this.db.categories),
        products:clone(this.db.products), currentUser:this.safeUser(user),
        users:full ? this.db.users.map(x=>this.safeUser(x)) : [],
        sales:clone(this.db.sales.filter(x=>full || x.userId===user.id).slice(0,1000)),
        shifts:clone(shifts.slice(0,300)), cashMoves:clone(this.db.cashMoves.filter(x=>full || shiftIds.has(x.shiftId)).slice(0,2000)),
        audit:user.role==='superuser' ? clone(this.db.audit.slice(0,500)) : [],
        revision:this.db.revision, serverTime:now()
      };
    }
    safeUser(u) { return {id:u.id,name:u.name,username:u.username,role:u.role,active:u.active,createdAt:u.createdAt}; }
    status() { return {initialized:this.store.initialized, name:this.store.initialized?this.db.store.name:'',version:'1.0.3'}; }
    setup(p) {
      if (this.store.initialized) throw new Error('Aplikasi sudah diinisialisasi.');
      const name=text(p.storeName,'Nama toko',80);
      const users=[['superuser',p.superName || 'Pemilik Toko',p.superUsername || 'superadmin',p.superPassword],['admin',p.adminName || 'Administrator',p.adminUsername || 'admin',p.adminPassword]];
      if (String(p.superPassword).toLowerCase()===String(p.adminPassword).toLowerCase()) throw new Error('Gunakan kata sandi yang berbeda untuk Super User dan Admin.');
      const created=users.map(([role,n,username,password])=>{
        if (typeof password!=='string' || password.length<8 || password.length>128) throw new Error('Kata sandi minimal 8 karakter, maksimal 128.');
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw new Error('Username: 3–32 huruf/angka, titik, garis bawah atau underscore.');
        return {id:uid(),name:text(n,'Nama pengguna',80),username:username.toLowerCase(),role,active:true,createdAt:now(),...this.hash(password)};
      });
      if (created[0].username===created[1].username) throw new Error('Username Super User dan Admin harus berbeda.');
      this.store.commit(d=>{ d.store.name=name; d.users=created; if(p.samples) seedProducts(d); this.audit(d,created[0],'Inisialisasi aplikasi'); });
      return this.login({username:created[0].username,password:p.superPassword});
    }
    hash(password) { return defaultHash(password,this.crypto); }
    login(p) {
      const username=text(p.username,'Username',32).toLowerCase(), key=username;
      const a=this.attempts.get(key) || {count:0,until:0};
      if (a.until>this.clock()) throw new Error('Terlalu banyak percobaan. Tunggu 60 detik.');
      if (typeof p.password!=='string' || p.password.length>128) throw new Error('Username atau kata sandi salah.');
      const u=this.db.users.find(x=>x.username===username);
      const candidate=this.crypto.scryptSync(p.password,u?.salt || '00000000000000000000000000000000',64);
      const valid=!!u && this.crypto.timingSafeEqual(candidate,this.fromHex(u.hash));
      if (!valid || !u.active) {
        a.count=a.until>this.clock()?a.count:a.count+1;
        if(a.count>=5){a.until=this.clock()+60000;a.count=0;} this.attempts.set(key,a);
        throw new Error('Username atau kata sandi salah, atau akun nonaktif.');
      }
      this.attempts.delete(key);
      const token=this.crypto.randomBytes(32).toString('hex');
      this.sessions.set(token,{userId:u.id,expires:this.clock()+12*60*60*1000});
      return {token,state:this.publicState(u)};
    }
    logout(token) { this.sessions.delete(token); return {ok:true}; }
    invalidateSessions() { this.sessions.clear(); }
    dispatch(op,p,token) {
      if(op==='status') return this.status();
      if(op==='setup') return this.setup(p||{});
      if(op==='login') return this.login(p||{});
      if(op==='logout') return this.logout(token);
      const admin=['admin','superuser'], owner=['superuser'];
      const permissions={
        'state':ROLES,'product.save':admin,'product.archive':admin,'stock.adjust':admin,
        'category.save':admin,'category.delete':admin,'settings.save':admin,
        'user.save':owner,'user.password':ROLES,'shift.open':ROLES,'shift.move':ROLES,'shift.close':ROLES,
        'sale.checkout':ROLES,'sale.void':owner,'sale.printed':ROLES,
        'report':admin,'backup.export':owner,'backup.restore':owner,'demo.clear':owner
      };
      if(!permissions[op]) throw new Error('Perintah tidak dikenal.');
      const u=this.auth(token,permissions[op]);
      const stateOps=['product.save','product.archive','stock.adjust','category.save','category.delete','settings.save','user.save','user.password','shift.open','shift.move','shift.close','sale.checkout','sale.void','demo.clear'];
      if(stateOps.includes(op)) {
        const result=op==='user.password'?this.user_password(p||{},u,token):this[op.replaceAll('.','_')](p||{},u);
        return {state:this.publicState(u),result};
      }
      if(op==='state') return this.publicState(u);
      if(op==='report') return this.report(p||{});
      if(op==='backup.export') {this.store.commit(d=>this.audit(d,u,'Ekspor backup')); return this.store.serialize();}
      if(op==='backup.restore') {
        const d=parseBackup(p.content); this.store.replace(d); this.invalidateSessions();
        return {ok:true,message:'Data dipulihkan. Semua pengguna harus masuk kembali.'};
      }
      if(op==='sale.printed') {
        this.store.commit(d=>{const s=d.sales.find(x=>x.id===p.id && (u.role!=='kasir'||x.userId===u.id));if(s)s.printCount=(s.printCount||0)+1;});
        return {ok:true};
      }
    }
    product_save(p,u) {
      const id=p.id || uid();
      const q={id,name:text(p.name,'Nama produk',100),sku:text(p.sku || `IT-${Date.now().toString(36).toUpperCase()}`,'Kode barang',32),
        barcode:text(p.barcode,'Barcode',64,false),category:text(p.category,'Kategori',40),unit:text(p.unit,'Satuan',16),
        cost:integer(p.cost,'Harga modal'),price:integer(p.price,'Harga jual'),stock:quantity(p.stock,'Stok',true),minStock:quantity(p.minStock,'Stok minimum',true),
        image:imageData(p.image),active:p.active!==false};
      this.store.commit(d=>{
        if(d.products.some(x=>x.id!==id && x.sku.toLowerCase()===q.sku.toLowerCase()))throw new Error('Kode barang sudah dipakai.');
        if(q.barcode&&d.products.some(x=>x.id!==id&&x.barcode.toLowerCase()===q.barcode.toLowerCase()))throw new Error('Barcode sudah dipakai produk lain.');
        if(!d.categories.includes(q.category))throw new Error('Pilih kategori yang tersedia.');
        const old=d.products.find(x=>x.id===id);
        if(p.id&&!old)throw new Error('Produk tidak ditemukan.');
        if(old){q.isDemo=old.isDemo;q.createdAt=old.createdAt;this.audit(d,u,'Edit produk',`${q.name}; harga ${old.price} → ${q.price}; stok ${old.stock} → ${q.stock}`);Object.assign(old,q);}
        else {q.isDemo=false;q.createdAt=now();d.products.push(q);this.audit(d,u,'Tambah produk',q.name);}
      }); return {id};
    }
    product_archive(p,u) {
      this.store.commit(d=>{const x=d.products.find(x=>x.id===p.id);if(!x)throw new Error('Produk tidak ditemukan.');x.active=!x.active;this.audit(d,u,x.active?'Aktifkan produk':'Arsipkan produk',x.name);});return {ok:true};
    }
    stock_adjust(p,u) {
      return this.stockAdjustSigned(p,u);
    }
    stockAdjustSigned(p,u) {
      const n=Number(p.delta);
      if(!Number.isFinite(n)||n===0||Math.abs(n)>100000||Math.abs(n*1000-Math.round(n*1000))>0.0001)throw new Error('Perubahan stok tidak valid.');
      const note=text(p.note,'Alasan penyesuaian',240);
      this.store.commit(d=>{const x=d.products.find(x=>x.id===p.id);if(!x)throw new Error('Produk tidak ditemukan.');const next=Math.round((x.stock+n)*1000)/1000;if(next<0||next>100000)throw new Error('Stok tidak boleh negatif atau lebih dari 100.000.');x.stock=next;this.audit(d,u,'Penyesuaian stok',`${x.name}: ${n>0?'+':''}${n}; ${note}`);});return {ok:true};
    }
    category_save(p,u) {
      const name=text(p.name,'Kategori',40),old=String(p.old||'');
      this.store.commit(d=>{
        if(d.categories.some(x=>x.toLowerCase()===name.toLowerCase()&&x!==old))throw new Error('Kategori sudah ada.');
        if(old){const i=d.categories.indexOf(old);if(i<0)throw new Error('Kategori tidak ditemukan.');d.categories[i]=name;d.products.filter(x=>x.category===old).forEach(x=>x.category=name);}
        else {if(d.categories.length>=100)throw new Error('Maksimal 100 kategori.');d.categories.push(name);}
        this.audit(d,u,'Simpan kategori',name);
      });return {ok:true};
    }
    category_delete(p,u) {
      this.store.commit(d=>{if(d.products.some(x=>x.category===p.name))throw new Error('Pindahkan produk dalam kategori ini terlebih dahulu.');d.categories=d.categories.filter(x=>x!==p.name);this.audit(d,u,'Hapus kategori',p.name);});return {ok:true};
    }
    settings_save(p,u) {
      const s=p.store||{},pr=p.printer||{};
      let appearance=null;
      if (p.appearance!==undefined) {
        if (u.role!=='superuser') throw new Error('Ukuran huruf hanya dapat diubah oleh Super User.');
        const fs=Number(p.appearance.fontScale);
        if (![1,1.125,1.25].includes(fs)) throw new Error('Ukuran huruf tidak valid.');
        appearance={fontScale:fs,boldText:!!p.appearance.boldText};
      }
      const store={name:text(s.name,'Nama toko',80),address:text(s.address,'Alamat',240,false),phone:text(s.phone,'Telepon',40,false),footer:text(s.footer,'Ucapan nota',400,false),logo:imageData(s.logo,true)};
      if(![58,80].includes(Number(pr.width))||!['driver','raw'].includes(pr.mode))throw new Error('Pilihan printer tidak valid.');
      const printer={name:text(pr.name,'Printer',180,false),paper:paperOf(pr.paper),width:Number(pr.width),mode:pr.mode,autoPrint:!!pr.autoPrint,silent:!!pr.silent,cut:!!pr.cut,credit:!!pr.credit,scale:scaleOf(pr.scale)};
      this.store.commit(d=>{d.store=store;d.printer=printer;if(appearance)d.appearance=appearance;this.audit(d,u,'Edit pengaturan',appearance?'Identitas toko / nota / printer / tampilan huruf':'Identitas toko / nota / printer');});return {ok:true};
    }
    user_save(p,u) {
      const id=p.id||uid(),role=p.role;
      if(!ROLES.includes(role))throw new Error('Peran tidak valid.');
      const username=text(p.username,'Username',32).toLowerCase();
      if(!/^[a-zA-Z0-9._-]{3,32}$/.test(username))throw new Error('Username tidak valid.');
      const name=text(p.name,'Nama pengguna',80);
      let credentials=null;
      if(!p.id||p.password){if(typeof p.password!=='string'||p.password.length<8||p.password.length>128)throw new Error('Kata sandi minimal 8 karakter.');credentials=this.hash(p.password);}
      this.store.commit(d=>{
        const old=d.users.find(x=>x.id===id);if(p.id&&!old)throw new Error('Akun tidak ditemukan.');
        if(d.users.some(x=>x.id!==id&&x.username===username))throw new Error('Username sudah dipakai.');
        const active=p.active!==false;
        if(old?.role==='superuser'&&old.active&&(!active||role!=='superuser')&&!d.users.some(x=>x.id!==id&&x.role==='superuser'&&x.active))throw new Error('Sisakan minimal satu Super User aktif.');
        if(old?.id===u.id&&(!active||role!=='superuser'))throw new Error('Anda tidak boleh menonaktifkan atau menurunkan akun sendiri.');
        if(old){Object.assign(old,{name,username,role,active});if(credentials)Object.assign(old,credentials);}
        else d.users.push({id,name,username,role,active,createdAt:now(),...credentials});
        this.audit(d,u,'Simpan akun',`${username} / ${role}`);
      });
      for(const [t,s] of this.sessions){const changed=this.db.users.find(x=>x.id===s.userId);if(s.userId===id && (p.password||!changed.active))this.sessions.delete(t);}
      return {ok:true};
    }
    user_password(p,u,currentToken) {
      if(typeof p.oldPassword!=='string'||p.oldPassword.length>128)throw new Error('Sandi lama tidak valid.');
      const check=this.crypto.scryptSync(p.oldPassword,u.salt,64);
      if(!this.crypto.timingSafeEqual(check,this.fromHex(u.hash)))throw new Error('Kata sandi lama salah.');
      if(typeof p.password!=='string'||p.password.length<8||p.password.length>128)throw new Error('Sandi baru minimal 8 karakter.');
      const h=this.hash(p.password);this.store.commit(d=>{Object.assign(d.users.find(x=>x.id===u.id),h);this.audit(d,u,'Ubah kata sandi');});
      for(const [t,s] of this.sessions)if(s.userId===u.id&&t!==currentToken)this.sessions.delete(t);
      return {ok:true};
    }
    currentShift(d,u) {return d.shifts.find(x=>x.userId===u.id&&x.status==='open');}
    shiftSummary(d,s) {
      const sales=d.sales.filter(x=>x.shiftId===s.id&&x.status==='completed'&&x.method==='Tunai').reduce((a,x)=>a+x.total,0);
      const moves=d.cashMoves.filter(x=>x.shiftId===s.id).reduce((a,x)=>a+(x.type==='in'?x.amount:-x.amount),0);
      return {cashSales:sales,moves,expected:s.opening+sales+moves};
    }
    shift_open(p,u) {
      const opening=integer(p.opening,'Modal awal');
      this.store.commit(d=>{if(this.currentShift(d,u))throw new Error('Shift Anda masih terbuka.');d.shifts.unshift({id:uid(),userId:u.id,userName:u.name,openedAt:now(),closedAt:'',opening,expected:0,counted:0,note:text(p.note,'Catatan',240,false),status:'open'});this.audit(d,u,'Buka kas',`Modal Rp ${opening}`);});return {ok:true};
    }
    shift_move(p,u) {
      const amount=integer(p.amount,'Nominal',1),note=text(p.note,'Catatan kas',240);
      if(!['in','out'].includes(p.type))throw new Error('Jenis kas tidak valid.');
      this.store.commit(d=>{const s=this.currentShift(d,u);if(!s)throw new Error('Buka kas terlebih dahulu.');if(p.type==='out'&&this.shiftSummary(d,s).expected<amount)throw new Error('Saldo kas tidak cukup.');d.cashMoves.unshift({id:uid(),shiftId:s.id,userId:u.id,userName:u.name,at:now(),type:p.type,amount,note});this.audit(d,u,p.type==='in'?'Kas masuk':'Kas keluar',`${amount}; ${note}`);});return {ok:true};
    }
    shift_close(p,u) {
      const counted=integer(p.counted,'Uang fisik');
      let summary;
      this.store.commit(d=>{const s=this.currentShift(d,u);if(!s)throw new Error('Tidak ada kas terbuka.');summary=this.shiftSummary(d,s);Object.assign(s,{status:'closed',closedAt:now(),expected:summary.expected,counted,difference:counted-summary.expected,closeNote:text(p.note,'Catatan tutup kas',240,false)});this.audit(d,u,'Tutup kas',`Fisik ${counted}; diharapkan ${summary.expected}`);});return summary;
    }
    sale_checkout(p,u) {
      const requestId=text(p.requestId,'ID transaksi',80);
      if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw new Error('ID transaksi tidak valid.');
      const existing=this.db.sales.find(x=>x.requestId===requestId);
      if(existing)return existing;
      if(!Array.isArray(p.items)||!p.items.length||p.items.length>500)throw new Error('Keranjang kosong atau terlalu banyak item.');
      const method=p.method||'Tunai';if(!['Tunai','QRIS','Transfer','Kartu'].includes(method))throw new Error('Metode pembayaran tidak valid.');
      const taxRate=p.taxRate===undefined?0:Number(p.taxRate);
      if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100||Math.abs(taxRate*100-Math.round(taxRate*100))>0.001)throw new Error('Tarif PPN tidak valid (0-100%, maks 2 angka desimal).');
      const discount=integer(p.discount||0,'Diskon');let id,existingAfter;
      this.store.commit(d=>{
        existingAfter=d.sales.find(x=>x.requestId===requestId);if(existingAfter)return;
        const map=new Map(),items=[];let subtotal=0,cost=0;
        for(const line of p.items){
          const product=d.products.find(x=>x.id===line.productId);
          if(!product||!product.active)throw new Error('Produk tidak tersedia. Muat ulang keranjang.');
          const qty=quantity(line.qty),old=map.get(product.id)||0;map.set(product.id,old+qty);
          if(old+qty>100000||old+qty>product.stock)throw new Error(`Stok ${product.name} tidak cukup (tersisa ${product.stock}).`);
          const prev=items.find(x=>x.productId===product.id);
          if(prev){prev.qty=Math.round((prev.qty+qty)*1000)/1000;prev.lineTotal=Math.round(prev.price*prev.qty);}
          else items.push({productId:product.id,name:product.name,sku:product.sku,unit:product.unit,qty,price:product.price,cost:product.cost,lineTotal:Math.round(product.price*qty)});
        }
        for(const item of items){subtotal+=item.lineTotal;cost+=Math.round(item.cost*item.qty);}
        if(discount>subtotal)throw new Error('Diskon melebihi subtotal.');
        if(discount>0&&u.role==='kasir')throw new Error('Diskon memerlukan izin Admin atau Super User.');
        const pajak=Math.round((subtotal-discount)*taxRate/100);
        const total=subtotal-discount+pajak;
        if(total>MAX_MONEY)throw new Error('Total transaksi melebihi Rp 1 miliar. Pisahkan transaksi.');
        const paid=method==='Tunai'?integer(p.paid,'Uang diterima',total,MAX_MONEY):total;
        const at=now(),number=`${dateKey().replaceAll('-','')}-${String(++d.counters.sale).padStart(5,'0')}`;
        id=uid();const shift=this.currentShift(d,u);
        const sale={id,requestId,number,at,userId:u.id,userName:u.name,shiftId:shift?.id||'',items,subtotal,cost,discount,taxRate,tax:pajak,total,paid,change:paid-total,method,reference:text(p.reference,'Referensi pembayaran',80,false),status:'completed',printCount:0,storeSnapshot:clone(d.store)};
        for(const [pid,qty] of map){const product=d.products.find(x=>x.id===pid);product.stock=Math.round((product.stock-qty)*1000)/1000;}
        d.sales.unshift(sale);this.audit(d,u,'Transaksi',`${number} / Rp ${total}`);
      });return existingAfter||this.db.sales.find(x=>x.id===id);
    }
    sale_void(p,u) {
      const reason=text(p.reason,'Alasan pembatalan',240);
      this.store.commit(d=>{
        const s=d.sales.find(x=>x.id===p.id);if(!s)throw new Error('Nota tidak ditemukan.');if(s.status==='void')throw new Error('Nota sudah dibatalkan.');
        const shift=d.shifts.find(x=>x.id===s.shiftId);if(shift&&shift.status==='closed')throw new Error('Kas transaksi sudah ditutup. Gunakan penyesuaian kas dan catatan audit, bukan pembatalan.');
        const quantities=new Map();s.items.forEach(i=>quantities.set(i.productId,(quantities.get(i.productId)||0)+i.qty));
        for(const [pid,qty] of quantities){const prod=d.products.find(x=>x.id===pid);if(prod)prod.stock=Math.round((prod.stock+qty)*1000)/1000;}
        s.status='void';s.voidReason=reason;s.voidAt=now();s.voidBy=u.name;this.audit(d,u,'Batalkan transaksi',`${s.number}; ${reason}`);
      });return {ok:true};
    }
    demo_clear(p,u) {
      this.store.commit(d=>{
        const used=new Set(d.sales.flatMap(s=>s.items.map(i=>i.productId)));let n=0;
        d.products=d.products.filter(x=>{if(!x.isDemo)return true;if(used.has(x.id)){x.active=false;return true;}n++;return false;});
        this.audit(d,u,'Bersihkan data contoh',`${n} produk dihapus; produk pernah terpakai diarsipkan.`);
      });return {ok:true};
    }
    report(p={}) {
      const from=p.from||dateKey(),to=p.to||dateKey();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new Error('Rentang tanggal tidak valid.');
      const sales=this.db.sales.filter(s=>s.status==='completed'&&dateKey(s.at)>=from&&dateKey(s.at)<=to);
      const total=sales.reduce((a,s)=>a+s.total,0),cost=sales.reduce((a,s)=>a+(s.cost||0),0);
      const byMethod={},byProduct={};
      for(const s of sales){byMethod[s.method]=(byMethod[s.method]||0)+s.total;for(const i of s.items){const x=byProduct[i.productId]||(byProduct[i.productId]={name:i.name,qty:0,total:0});x.qty+=i.qty;x.total+=i.lineTotal;}}
      const tax=sales.reduce((a,s)=>a+(s.tax||0),0);
      return {from,to,count:sales.length,total,tax,cost,profit:total-tax-cost,byMethod,byProduct,subtotal:sales.reduce((a,s)=>a+s.subtotal,0),discount:sales.reduce((a,s)=>a+s.discount,0),sales};
    }
  }
  return {VERSION,ROLES,uid,now,dateKey,quantity,integer,text,clone,checksum,envelope,emptyDB,seedProducts,validateDB,parseBackup,MemoryAdapter,Store,Service,MAX_MONEY};
});
