/* Shared receipt rendering: driver HTML and ESC/POS plain-text layout. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WPOSReceipt=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rp=n=>'Rp '+Math.round(Number(n)||0).toLocaleString('id-ID');
  const qty=n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:3});

  /* ---- Jenis kertas ----------------------------------------------------
     thermal    : kertas gulung termal 58 / 80 mm, tinggi mengikuti isi struk
     a4         : kertas HVS A4 210 x 297 mm, isi struk dicetak di tengah
                  (untuk printer biasa / printer yang tidak support roll)
     continuous : Continuous Form 215,9 x 279,4 mm (8,5 x 11 inci) — kertas
                  berlubang dot matrix, ganti halaman di setiap perforasi       */
  const PAPERS={
    thermal:   {label:'Kertas struk termal',sheet:false,pageW:58,   pageH:null, content:58, font:11,padX:3,padTop:3, padBot:6},
    a4:        {label:'Kertas A4',          sheet:true, pageW:210,  pageH:297,  content:80, font:12,padX:0,padTop:10,padBot:10},
    continuous:{label:'Continuous Form',    sheet:true, pageW:215.9,pageH:279.4,content:190,font:13,padX:0,padTop:12,padBot:12}
  };
  const MM_PX=96/25.4;
  /* Skala isi: memperkecil isi struk bila driver merek tertentu memotong
     tepi kanan/atas kertas. Lebar kertas (pageW) tetap sesuai ukuran asli. */
  function scaleOf(v){const n=Number(v);return [85,90,95,100].includes(n)?n:100;}
  function layout(paper,width,scale){
    const f=scaleOf(scale)/100;
    const shrink=L=>Object.assign(L,{content:+(L.content*f).toFixed(2),font:+(L.font*f).toFixed(2),padX:+(L.padX*f).toFixed(2),padTop:+(L.padTop*f).toFixed(2),padBot:+(L.padBot*f).toFixed(2),scale:scaleOf(scale)});
    if(PAPERS[paper]&&paper!=='thermal')return shrink(Object.assign({paper:paper},PAPERS[paper]));
    const w=Number(width)===80?80:58;
    return shrink({paper:'thermal',sheet:false,pageW:w,pageH:null,content:w,font:11,padX:2,padTop:3,padBot:6,cols:w===80?48:32});
  }
  /* Ukuran kotak pratinjau (px) untuk iframe nota. */
  function previewBox(paper,width,scale){
    const L=layout(paper,width,scale),px=L.content*MM_PX;
    return {width:Math.min(340,Math.round(px)+4),zoom:Math.min(1,320/px)};
  }
  /* Bersihkan kredit pengembang dari teks apa pun yang akan tercetak. */
  const CREDIT_RE=/(?:aplikasi\s+ini\s+)?(?:di)?(?:kembangkan|buat|bikin)\s+(?:oleh|dari|dikembangkan)\s+\S+|bolang\s*corp/gi;
  function scrub(s){return String(s??'').replace(CREDIT_RE,'').replace(/[ \t]{2,}/g,' ').trim();}

  function rows(sale){
    const rows=[];
    const push=(left='',right='',align='between')=>rows.push({left:String(left),right:String(right),align});
    push('Subtotal',rp(sale.subtotal));
    if(sale.discount)push('Diskon','- '+rp(sale.discount));
    if(sale.tax)push('PPN '+Number(sale.taxRate||0).toLocaleString('id-ID',{maximumFractionDigits:2})+'%',rp(sale.tax));
    push('TOTAL',rp(sale.total));
    push(sale.method==='Tunai'?'Tunai':sale.method,rp(sale.paid));
    if(sale.method==='Tunai')push('Kembali',rp(sale.change));
    return rows;
  }
  function optsFrom(width,preview,opts){
    if(width&&typeof width==='object')return Object.assign({width:58,preview:false,paper:'thermal',credit:false,scale:100},width);
    return Object.assign({width:Number(width)===80?80:58,preview:!!preview,paper:'thermal',credit:false,scale:100},opts||{});
  }
  function html(sale,store,width,preview,opts){
    const o=optsFrom(width,preview,opts);
    const L=layout(o.paper,o.width,o.scale);
    const zoom=o.preview?previewBox(o.paper,o.width,o.scale).zoom:1;
    const store2={name:scrub(store.name),address:scrub(store.address),phone:scrub(store.phone),footer:scrub(store.footer),logo:store.logo};
    const date=new Date(sale.at);
    const tanggal=date.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+date.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const items=sale.items.map(i=>`<div class="item"><div>${esc(scrub(i.name))}</div><div class="line"><span>${qty(i.qty)} ${esc(i.unit)} x ${esc(rp(i.price))}</span><span>${esc(rp(i.lineTotal))}</span></div></div>`).join('');
    const totals=rows(sale).map(r=>`<div class="line ${r.left==='TOTAL'?'total':''}"><span>${esc(r.left)}</span><span>${esc(r.right)}</span></div>`).join('');
    const logo=store2.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(store2.logo)?`<img class="logo" src="${esc(store2.logo)}" alt="Logo toko">`:'';
    const tail=o.credit?(sale.printCount?'Cetak ulang · ':'')+'Warung POS':(sale.printCount?'Cetak ulang':'');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
      @page{size:${L.pageW}mm ${L.pageH?L.pageH+'mm':'auto'};margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
      html{zoom:${zoom}}
      body{font-family:'Consolas','Courier New',monospace;font-size:${L.font}px;line-height:1.4}
      .receipt{width:${L.content}mm;padding:${L.padTop}mm ${L.padX}mm ${L.padBot}mm;margin:0 auto;overflow-wrap:anywhere}
      .center{text-align:center}.logo{display:block;max-width:32mm;max-height:22mm;object-fit:contain;margin:0 auto 3mm}
      h1{font-size:${L.font+4}px;line-height:1.25;margin:0 0 2mm;letter-spacing:.3px}p{margin:1mm 0}.meta{font-size:${L.font-1}px;margin:3mm 0}
      .line{display:flex;justify-content:space-between;gap:2mm;align-items:flex-start}.line span:last-child{text-align:right;white-space:nowrap}
      .rule{border-top:1px dashed #000;margin:2.5mm 0}.item{margin:2mm 0}
      .total{font-weight:bold;font-size:${L.font+2}px;border-top:1px solid #000;padding-top:2mm;margin-top:2mm}
      .footer{white-space:pre-wrap;margin-top:3mm;font-size:${L.font}px}.muted{font-size:${L.font-2}px}
      .void{border:2px solid #000;padding:2mm;font-weight:bold;font-size:${L.font+3}px;margin:3mm 0}.reference{font-size:${L.font-1}px}
      @media print{.item,.line,.total{break-inside:avoid}}
    </style></head><body><main class="receipt">${logo}<header class="center"><h1>${esc(store2.name)}</h1>${store2.address?`<p>${esc(store2.address)}</p>`:''}${store2.phone?`<p>Telp. ${esc(store2.phone)}</p>`:''}</header><div class="rule"></div><div class="meta"><div class="line"><span>No.</span><span>${esc(sale.number)}</span></div><div class="line"><span>${esc(tanggal)}</span><span>${esc(sale.userName)}</span></div></div><div class="rule"></div>${sale.status==='void'?'<div class="center void">TRANSAKSI DIBATALKAN</div>':''}${items}<div class="rule"></div>${totals}${sale.reference?`<div class="reference">Ref: ${esc(sale.reference)}</div>`:''}<div class="rule"></div><div class="center footer">${esc(store2.footer)}</div>${tail?`<div class="center muted" style="margin-top:3mm">${esc(tail)}</div>`:''}</main></body></html>`;
  }
  function wrap(s,n){const words=String(s).split(/\s+/),lines=[];let line='';for(let word of words){while(word.length>n){if(line){lines.push(line);line='';}lines.push(word.slice(0,n));word=word.slice(n);}if((line+' '+word).trim().length>n){if(line)lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);return lines;}
  function line(left,right,n){left=String(left);right=String(right);if(left.length+right.length+1<=n)return [left+' '.repeat(n-left.length-right.length)+right];return [left,right.padStart(n)];}
  function text(sale,store,width=58,opts){
    const o=optsFrom(width,false,opts);
    const L=layout(o.paper||'thermal',o.width,o.scale);
    const n=L.cols||(o.width===80?48:32),center=s=>wrap(s,n).map(x=>x.padStart(Math.floor((n+x.length)/2))).join('\n');
    const store2={name:scrub(store.name),address:scrub(store.address),phone:scrub(store.phone),footer:scrub(store.footer)};
    const a=[center(store2.name.toUpperCase()),center(store2.address),center(store2.phone?'Telp. '+store2.phone:''),'-'.repeat(n),sale.number,`${new Date(sale.at).toLocaleString('id-ID')}  ${sale.userName}`,'-'.repeat(n)];
    if(sale.status==='void')a.push(center('*** TRANSAKSI DIBATALKAN ***'));
    for(const i of sale.items)a.push(...wrap(scrub(i.name),n),...line(`${qty(i.qty)} ${i.unit} x ${rp(i.price)}`,rp(i.lineTotal),n));
    a.push('-'.repeat(n));for(const r of rows(sale))a.push(...line(r.left,r.right,n));
    if(sale.reference)a.push(...wrap('Ref: '+sale.reference,n));
    a.push('-'.repeat(n),center(store2.footer));
    if(o.credit)a.push('',center('Warung POS'));
    a.push('','','');return a.join('\n');
  }
  return {html,text,esc,rp,layout,previewBox,scrub,scaleOf,PAPERS};
});
