
/* ══════════════════════════════════════════════════════════════
   상태
   · 파일(doc)마다 열 설정을 따로 가짐
   · 왼쪽에서 체크한 파일들(S.sel)이 "편집 대상" — 가운데 목록은 그 파일들의 열을
     이름으로 합쳐 보여주고, 바꾸면 같은 이름의 열에 전부 적용됨
   · 마스킹은 올린 파일 전체를 하나의 코드 체계로 한 번에 처리
   ══════════════════════════════════════════════════════════════ */
const MIXED={};
const BIRTH=/(생년월일|생일|출생일|출생년월일|birth|dob)/i;
const MODES=['shape','token','safe','calc','del'];
const MODE_SHORT={shape:'형태유지',token:'토큰',safe:'비식별',calc:'기간',del:'삭제'};
const MODE_TINY={shape:'형태',token:'토큰',safe:'비식별',calc:'기간',del:'삭제'};
const mlabel=m=>'<span class="l">'+MODE_SHORT[m]+'</span><span class="s">'+MODE_TINY[m]+'</span>';
const MODE_TIP={shape:'진짜처럼 보이는 값으로 바꿈 (자릿수·형식 유지)',token:'NAME_0001 같은 일련번호',
  safe:'숫자·@ 없이 문자만 → 개인정보 형식으로 안 읽힘',calc:'날짜 → 기준일까지의 만 나이·연령대·년·개월·일',del:'값을 아예 없앰'};
const SHAPE_HINT={name:'홍길동 → 서지우',phone:'형식 유지 — 형식 검사엔 걸림',email:'형식 유지 — 형식 검사엔 걸림',
  rrn:'형식 유지 — 형식 검사엔 걸림',card:'형식 유지 — 형식 검사엔 걸림',account:'형식 유지 — 형식 검사엔 걸림',
  address:'다른 실제 주소 꼴로',id:'A1234 → K8302',number:'자릿수 유지',date:'연도 두고 월·일만 바꿈',text:'글자 종류 유지'};
const PREV0=20, PREV_STEP=100, PREV_MAX=500, PREV_COLS=60;

const S={ docs:[], sel:new Set(), focus:null, csel:new Set(), lastKey:null, view:'cols',
  norm:1, sweep:true, book:null, bookNames:[], res:null, mapFile:null,
  showMask:true, prevRows:PREV0, nextId:1, bulkUnit:'age', bulkRef:TODAY, _entries:[], _groups:[] };
const byId=id=>S.docs.find(d=>d.id===id);
const selDocs=()=>S.docs.filter(d=>S.sel.has(d.id));
const startOf=d=>(d.noHeader?-1:d.headerRow)+1;

/* ── 시트 읽기 (다시 읽어도 같은 이름 열의 설정은 유지) ── */
function loadDocSheet(d){
  const keep=new Map((d.cols||[]).map(c=>[c.key,c]));
  const ws=d.wb.Sheets[d.sheet];
  d.grid=ws?sheetToGrid(ws):[];
  d.rows=new Set(); d.masked=null; d.fail=null; d.file=null;
  const hr=d.noHeader?-1:d.headerRow, W=d.grid.length?d.grid[0].length:0, st=hr+1, seen={};
  d.cols=[];
  for(let c=0;c<W;c++){
    const raw=hr>=0&&d.grid[hr]?String(d.grid[hr][c]==null?'':d.grid[hr][c]).trim():'';
    const base=raw||(colLetter(c)+' 열');
    seen[base]=(seen[base]||0)+1;
    const key=seen[base]>1?base+' ('+seen[base]+')':base;
    const vals=[];
    for(let r=st;r<d.grid.length&&vals.length<260;r++){ const v=d.grid[r][c]; if(v!==''&&v!=null) vals.push(v); }
    const t=detectType(hr>=0?raw:'',vals), birth=hr>=0&&BIRTH.test(raw);
    /* 전화·주민·카드·계좌·이메일은 형태유지로 바꿔도 결과가 여전히 개인정보 "형식"이라 기본을 비식별로.
       생년월일은 날짜 자체가 개인정보라 기본을 만 나이 계산으로 */
    const col={key,idx:c,detected:t,type:t,birth,
      mode:birth?'calc':(PATTERNED.includes(t)?'safe':'shape'),
      on:birth||SENSITIVE.includes(t),
      prefix:TYPES[t].prefix,blank:'',unit:'age',ref:TODAY,
      sample:vals.slice(0,3).map(v=>String(v)).join(' · ')};
    const k=keep.get(key);
    if(k) for(const f of ['type','mode','on','prefix','blank','unit','ref']) col[f]=k[f];
    d.cols.push(col);
  }
  d.sig=d.cols.map(c=>c.key).join('\u0001');
  d.dataRows=Math.max(0,d.grid.length-st);
}

/* ── 결과 무효화 — 설정이 바뀌면 이전 결과는 버림 ── */
function invalidate(){
  if(!S.res) return;
  S.res=null; S.mapFile=null;
  S.docs.forEach(d=>{ d.masked=null; d.file=null; d.fail=null; });
  $('#rescard').classList.add('hide');
  $('#ctab button[data-v="res"]').disabled=true;
  if(S.view==='res') S.view='cols';
}
function changed(){ invalidate(); renderFiles(); renderTarget(); setView(S.view); }

/* ══════════ 파일 ══════════ */
function bindDrop(dropSel,inputSel,onFiles){
  const d=$(dropSel), i=$(inputSel);
  d.onclick=()=>i.click();
  i.onchange=()=>{ if(i.files.length){ onFiles(i.files); i.value=''; } };
  ['dragenter','dragover'].forEach(ev=>d.addEventListener(ev,e=>{ e.preventDefault(); d.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev=>d.addEventListener(ev,e=>{ e.preventDefault(); d.classList.remove('over'); }));
  d.addEventListener('drop',e=>{ if(e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
}
bindDrop('#drop','#file',addFiles);
$('#addmore').onclick=()=>$('#file').click();

async function addFiles(list){
  const files=Array.prototype.slice.call(list), added=[];
  for(const f of files){
    await busy('파일 읽는 중…', f.name+' · '+(f.size/1048576).toFixed(1)+'MB');
    try{
      const {wb,raw}=await readWorkbook(f);
      if(!wb.SheetNames.length){ toast(f.name+' — 시트가 없음','bad'); continue; }
      const d={id:S.nextId++,name:f.name.replace(/\.[^.]+$/,''),isCsv:isCsvName(f.name),size:f.size,
               wb,sheet:wb.SheetNames[0],headerRow:0,noHeader:false,cols:[]};
      loadDocSheet(d);
      S.docs.push(d); added.push(d);
      if(raw) WK.preload(d.id,raw);   /* 다른 시트를 원본 그대로 보존하려고 저장용 빌더에도 올려둠 */
    }catch(e){ console.error(e); toast(f.name+' — 열지 못함: '+e.message,'bad'); }
  }
  idle();
  if(!added.length) return;
  invalidate();
  /* 새로 올린 파일 중 첫 파일과 같은 양식인 것들을 편집 대상으로 */
  const sig=added[0].sig;
  S.sel=new Set(added.filter(d=>d.sig===sig).map(d=>d.id));
  S.focus=added[0].id; S.csel.clear(); S.prevRows=PREV0;
  renderAll();
  const kinds=new Set(added.map(d=>d.sig)).size;
  toast(added.length>1
    ? '파일 '+added.length+'개 · 양식 '+kinds+'종'+(kinds>1?' — 같은 양식끼리 묶여 있음':' — 전부 같은 양식이라 한 번에 설정됨')
    : added[0].name+' 읽음 · '+nf(added[0].dataRows)+'행','ok');
}
function removeDoc(id){
  S.docs=S.docs.filter(d=>d.id!==id); S.sel.delete(id);
  if(S.focus===id) S.focus=null;
  if(!S.sel.size&&S.docs.length) S.sel.add(S.docs[0].id);
  invalidate(); renderAll();
}
$('#clearall').onclick=()=>{
  if(!S.docs.length) return;
  if(!confirm('올린 파일 '+S.docs.length+'개를 모두 뺄까요?')) return;
  S.docs=[]; S.sel.clear(); S.focus=null; S.csel.clear(); invalidate(); renderAll();
};

/* ── 같은 양식 묶음 ── */
function groups(){
  const m=new Map();
  S.docs.forEach(d=>{ let g=m.get(d.sig); if(!g){ g=[]; m.set(d.sig,g); } g.push(d); });
  return Array.from(m.values());
}
const letter=i=>String.fromCharCode(65+i%26)+(i>=26?Math.floor(i/26):'');
function groupOf(d){ const gs=S._groups; for(let i=0;i<gs.length;i++) if(gs[i].includes(d)) return i; return 0; }

function renderFiles(){
  const has=S.docs.length>0;
  $('#filecard').classList.toggle('hide',!has);
  $('#fcount').textContent=S.docs.length+'개';
  $('#run').disabled=!has;
  const gs=S._groups=groups();
  let h='';
  gs.forEach((g,gi)=>{
    const allSel=g.every(d=>S.sel.has(d.id)), L=letter(gi);
    h+='<div class="fgrp" style="animation-delay:'+Math.min(gi*35,280)+'ms">';
    if(g.length>1) h+='<div class="fgh" title="열 '+g[0].cols.length+'개 구성이 같은 파일들"><span class="tag">'+L+'</span>같은 양식 '+g.length+'개'
      +'<span class="sp"></span><button class="btn xs'+(allSel&&S.sel.size===g.length?' ghost':'')+'" data-g="'+gi+'">'
      +(allSel&&S.sel.size===g.length?'편집 중':'묶어서 설정')+'</button></div>';
    g.forEach(d=>{
      const on=d.cols.filter(c=>c.on).length, s=S.sel.has(d.id);
      h+='<div class="frow'+(s?' sel':'')+(S.focus===d.id?' focus':'')+'" data-id="'+d.id+'">'
        +'<span class="ck'+(s?' on':'')+'" data-a="ck" title="편집 대상에 넣기/빼기"></span>'
        +'<div class="fn"><b title="'+esc(d.name)+'">'+esc(d.name)+'</b>'
        +'<span>'+(g.length>1?'':'양식 '+L+' · ')+nf(d.dataRows)+'행 · '+d.cols.length+'열 · 켠 열 '+on+'</span></div>'
        +(d.masked?'<span class="bd g">완료</span>':'')
        +'<span class="x" data-a="x" title="이 파일 빼기">✕</span></div>';
    });
    h+='</div>';
  });
  morph($('#flist'),h);
  const all=has&&S.docs.every(d=>S.sel.has(d.id));
  $('#fall').className='ck'+(all?' on':(S.sel.size?' mix':''));
}
$('#flist').addEventListener('click',e=>{
  const g=e.target.closest('[data-g]');
  if(g){ const grp=S._groups[+g.dataset.g]; S.sel=new Set(grp.map(d=>d.id)); S.focus=grp[0].id; S.prevRows=PREV0; renderAll(); return; }
  const row=e.target.closest('.frow'); if(!row) return;
  const id=+row.dataset.id, a=e.target.closest('[data-a]'), act=a&&a.dataset.a;
  if(act==='x'){ removeDoc(id); return; }
  if(act==='ck'){
    S.sel.has(id)?S.sel.delete(id):S.sel.add(id);
    if(S.sel.has(id)) S.focus=id; else if(S.focus===id) S.focus=selDocs()[0]?selDocs()[0].id:null;
  }else{ S.sel=new Set([id]); S.focus=id; }
  S.prevRows=PREV0; renderAll();
});
$('#fallk').onclick=()=>{
  const all=S.docs.length&&S.docs.every(d=>S.sel.has(d.id));
  S.sel=all?new Set():new Set(S.docs.map(d=>d.id));
  if(!all&&!S.focus&&S.docs[0]) S.focus=S.docs[0].id;
  renderAll();
};

/* ══════════ 가운데 머리 ══════════ */
function renderTarget(){
  const ds=selDocs(), el=$('#target');
  if(!S.docs.length){ el.innerHTML='열 설정'; return; }
  if(!ds.length){ el.innerHTML='편집할 파일을 왼쪽에서 고르세요'; return; }
  const kinds=new Set(ds.map(d=>d.sig)).size;
  if(ds.length===1) el.innerHTML='<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(ds[0].name)+'</span>'
    +'<small>양식 '+letter(groupOf(ds[0]))+' · '+nf(ds[0].dataRows)+'행</small>';
  else el.innerHTML='파일 '+ds.length+'개 함께 설정<small>'+(kinds===1?'같은 양식 — 한 번 바꾸면 전부 적용'
    :'양식 '+kinds+'종 섞임 — 같은 이름 열끼리 함께 바뀜')+'</small>';
}
function renderCtl(){
  const ds=selDocs(), on=ds.length>0;
  $('#ctl').classList.toggle('hide',!on);
  if(!on) return;
  const f=byId(S.focus)&&S.sel.has(S.focus)?byId(S.focus):ds[0];
  $('#sheet').innerHTML=f.wb.SheetNames.map(n=>'<option'+(n===f.sheet?' selected':'')+'>'+esc(n)+'</option>').join('');
  $('#hrow').value=f.headerRow+1; $('#hrow').disabled=f.noHeader;
  $('#nohdr').classList.toggle('on',f.noHeader);
  const types=new Set(); (S._entries.length?S._entries:[]).forEach(e=>types.add(e.refs[0].c.detected));
  $('#picktype').innerHTML='<option value="">유형으로 고르기…</option>'
    +Object.keys(TYPES).filter(k=>types.has(k)).map(k=>'<option value="'+k+'">'+TYPES[k].label+'</option>').join('');
}
async function reloadSel(fn,msg){
  const ds=selDocs(); if(!ds.length) return;
  await busy('다시 읽는 중…',ds.length>1?'파일 '+ds.length+'개':ds[0].name);
  let n=0; ds.forEach(d=>{ if(fn(d)!==false){ loadDocSheet(d); n++; } });
  idle(); invalidate(); renderAll();
  if(msg) toast(msg(n,ds.length),'ok');
}
$('#sheet').onchange=e=>{ const v=e.target.value;
  reloadSel(d=>{ if(!d.wb.Sheets[v]) return false; d.sheet=v; },(n,t)=>n<t?('시트 "'+v+'"가 있는 파일 '+n+'/'+t+'개만 바꿈'):'시트 바꿈'); };
$('#hrow').onchange=e=>{ const v=Math.max(0,(parseInt(e.target.value,10)||1)-1); reloadSel(d=>{ d.headerRow=v; }); };
$('#nohdr').onclick=()=>{ const v=!$('#nohdr').classList.contains('on'); reloadSel(d=>{ d.noHeader=v; }); };
$('#autopick').onclick=()=>{
  let n=0; selDocs().forEach(d=>d.cols.forEach(c=>{ if((SENSITIVE.includes(c.detected)||c.birth)&&!c.on){ c.on=true; n++; } }));
  changed(); toast(n?('개인정보로 보이는 열 '+n+'개 켬'):'더 켤 만한 열이 없음',n?'ok':'warn');
};
$('#alloff').onclick=()=>{ selDocs().forEach(d=>d.cols.forEach(c=>c.on=false)); changed(); };
$('#picktype').onchange=e=>{
  const t=e.target.value; if(!t) return;
  S._entries.forEach(x=>{ if(x.refs[0].c.detected===t) S.csel.add(x.key); });
  e.target.value=''; setView('cols'); renderCols();
};

/* ── 열 설정 / 미리보기 전환 ── */
const viewScroll={};
function setView(v){
  if(v==='res'&&!S.res) v='cols';
  const mb=$('#mbody'), prev=S.view, sw=prev!==v;
  if(sw) viewScroll[prev]=mb.scrollTop;
  S.view=v;
  const has=S.docs.length>0;
  $$('#ctab button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  $('#colview').classList.toggle('hide',v!=='cols'||!has);
  $('#prevview').classList.toggle('hide',v!=='prev'||!has);
  $('#resview').classList.toggle('hide',v!=='res'||!has);
  $('#ctl').style.display=v==='res'?'none':'';
  if(v==='cols') renderCols(); else if(v==='prev') renderPrev();
  if(sw) mb.scrollTop=viewScroll[v]||0;
}
$('#ctab').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b&&!b.disabled) setView(b.dataset.v); });

/* ══════════ 열 목록 (여러 파일을 이름으로 합쳐서) ══════════ */
function entries(){
  const ds=selDocs().slice().sort((a,b)=>(a.id===S.focus?-1:0)-(b.id===S.focus?-1:0));
  const map=new Map(), out=[];
  ds.forEach(d=>d.cols.forEach(c=>{
    let e=map.get(c.key); if(!e){ e={key:c.key,refs:[]}; map.set(c.key,e); out.push(e); }
    e.refs.push({d,c});
  }));
  return out;
}
const pv=(e,f)=>{ const v=e.refs[0].c[f]; for(const r of e.refs) if(r.c[f]!==v) return MIXED; return v; };

function optHTML(e,mode){
  if(mode===MIXED) return '<span class="mix">파일마다 방식이 다름</span>';
  const val=f=>{ const x=pv(e,f); return x===MIXED?'':x; };
  const mixed=f=>pv(e,f)===MIXED;
  if(mode==='token'||mode==='safe')
    return '<input type="text" data-a="prefix" value="'+esc(val('prefix'))+'" placeholder="'+(mixed('prefix')?'혼합':'접두어')+'" title="'+(mode==='safe'?'접두어 — 숫자는 빼고 문자만 씀':'토큰 접두어')+'">';
  if(mode==='del')
    return '<input type="text" data-a="blank" value="'+esc(val('blank'))+'" placeholder="'+(mixed('blank')?'혼합':'비우면 공란 · 예: ●●●')+'">';
  if(mode==='calc'){
    const u=pv(e,'unit');
    return '<select data-a="unit" title="계산 단위">'+(u===MIXED?'<option value="" selected>혼합</option>':'')
      +Object.keys(UNITS).map(k=>'<option value="'+k+'"'+(k===u?' selected':'')+'>'+UNITS[k].label+'</option>').join('')+'</select>'
      +'<input type="date" data-a="ref" value="'+esc(val('ref'))+'" title="기준일 — 이 날짜까지의 기간을 계산함">';
  }
  const t=pv(e,'type');
  return '<span class="nomatch">'+esc(t===MIXED?'진짜처럼 보이는 값으로':(SHAPE_HINT[t]||''))+'</span>';
}
function rowHTML(e,n,i){
  const c0=e.refs[0].c, mode=pv(e,'mode'), type=pv(e,'type');
  const allOn=e.refs.every(r=>r.c.on), anyOn=e.refs.some(r=>r.c.on), sel=S.csel.has(e.key);
  const mc=mode===MIXED?'var(--warn)':'var(--m-'+mode+')';
  const tOpts=(type===MIXED?'<option value="" selected>혼합</option>':'')
    +Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(k===type?' selected':'')+'>'+TYPES[k].label+'</option>').join('');
  const where=e.refs.length<n?e.refs.length+'/'+n+'개 파일에 있음':(n>1?n+'개 파일 공통':'');
  return '<div class="crow'+(sel?' sel':'')+(anyOn?' on':' off')+'" data-k="'+esc(e.key)+'" style="--mc:'+mc+';animation-delay:'+Math.min(i*10,260)+'ms">'
    +'<span class="ck'+(sel?' on':'')+'" data-a="sel" title="여러 열 고르기 (Shift = 범위)"></span>'
    +'<span class="sw'+(allOn?' on':(anyOn?' mix':''))+'" data-a="on" title="마스킹 켜기/끄기"></span>'
    +'<div class="cn" title="'+esc(e.key)+(where?' — '+where:'')+'"><div class="nm"><span>'+esc(e.key)+'</span>'
      +(e.refs.length<n?'<span class="bd w">'+e.refs.length+'/'+n+'</span>':'')+'</div>'
      +'<small><span class="bd'+(SENSITIVE.includes(c0.detected)||c0.birth?' w':'')+'">'+(c0.birth?'생년월일':TYPES[c0.detected].label)+'</span>'
      +'<span class="ex">'+esc(c0.sample||'값 없음')+'</span></small></div>'
    +'<select class="ty" data-a="type"'+(mode==='del'||mode==='calc'?' disabled':'')+' title="유형 — 형태유지·토큰이 어떤 값을 만들지 정함">'+tOpts+'</select>'
    +'<div class="seg mseg md">'+MODES.map(m=>'<button data-a="mode" data-v="'+m+'"'+(mode===m?' class="on"':'')
      +' title="'+MODE_TIP[m]+'">'+mlabel(m)+'</button>').join('')+'</div>'
    +'<div class="opt">'+optHTML(e,mode)+'</div></div>';
}
function bulkHTML(n){
  const tOpts=Object.keys(TYPES).map(k=>'<option value="'+k+'">'+TYPES[k].label+'</option>').join('');
  const uOpts=Object.keys(UNITS).map(k=>'<option value="'+k+'"'+(k===S.bulkUnit?' selected':'')+'>'+UNITS[k].label+'</option>').join('');
  return '<div class="bulk"><span class="cnt">'+n+'개 선택</span>'
    +'<button class="btn xs" data-b="on">켜기</button><button class="btn xs" data-b="off">끄기</button><span class="div"></span>'
    +'<div class="seg mseg">'+MODES.map(m=>'<button data-b="mode" data-v="'+m+'" title="'+MODE_TIP[m]+'">'+mlabel(m)+'</button>').join('')+'</div>'
    +'<span class="div"></span><select data-b="type" style="width:auto"><option value="">유형 바꾸기…</option>'+tOpts+'</select>'
    +'<span class="grp">기간 <select data-b="unit" style="width:auto" title="기간 계산 단위">'+uOpts+'</select>'
    +'기준일 <input type="date" data-b="ref" value="'+esc(S.bulkRef)+'" title="기간 계산 기준일"></span>'
    +'<span style="flex:1"></span><button class="btn xs ghost" data-b="clear">선택 해제 <span style="opacity:.6">Esc</span></button></div>';
}
function renderCols(){
  const el=$('#colview'), ds=selDocs();
  if(!S.docs.length){ el.innerHTML=''; return; }
  if(!ds.length){ S._entries=[];
    morph(el,'<div class="empty"><div><h4>편집할 파일을 고르세요</h4><div>왼쪽 목록에서 파일을 누르거나 체크하면 됨</div></div></div>'); return; }
  const es=S._entries=entries();
  const keys=new Set(es.map(e=>e.key));
  Array.from(S.csel).forEach(k=>{ if(!keys.has(k)) S.csel.delete(k); });
  const all=es.length&&es.every(e=>S.csel.has(e.key));
  let h='<div class="chead"><span class="ck'+(all?' on':(S.csel.size?' mix':''))+'" data-a="selall" title="전체 선택"></span>'
    +'<span>사용</span><span>열 이름 · 감지 · 예시</span><span>유형</span><span>방식</span><span>세부 설정</span></div>';
  es.forEach((e,i)=>{ h+=rowHTML(e,ds.length,i); });
  /* 일괄 바는 목록 아래에 떠 있음 — 위에 끼어들면 목록이 밀려서 스크롤이 튐 */
  if(S.csel.size) h+=bulkHTML(S.csel.size);
  morph(el,h);
  renderCtl();
}
function setMode(refs,m){
  refs.forEach(r=>{ r.c.mode=m; r.c.on=true;
    if(m==='calc'){ r.c.unit=r.c.unit||S.bulkUnit; r.c.ref=r.c.ref||S.bulkRef; } });
}
const entryOf=k=>S._entries.find(x=>x.key===k);
const selRefs=()=>S._entries.filter(e=>S.csel.has(e.key)).reduce((a,e)=>a.concat(e.refs),[]);
function toggleSel(key,shift){
  const keys=S._entries.map(e=>e.key);
  if(shift&&S.lastKey!=null&&keys.includes(S.lastKey)){
    const a=keys.indexOf(S.lastKey), b=keys.indexOf(key);
    for(let i=Math.min(a,b);i<=Math.max(a,b);i++) S.csel.add(keys[i]);
  }else S.csel.has(key)?S.csel.delete(key):S.csel.add(key);
  S.lastKey=key; renderCols();
}
$('#colview').addEventListener('mousedown',e=>{ if(e.shiftKey&&e.target.closest('.crow')) e.preventDefault(); });
$('#colview').addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('[data-a="selall"]')){
    const all=S._entries.every(x=>S.csel.has(x.key));
    S.csel=all?new Set():new Set(S._entries.map(x=>x.key)); renderCols(); return;
  }
  const bb=t.closest('button[data-b]');
  if(bb){
    const b=bb.dataset.b, refs=selRefs();
    if(b==='clear'){ S.csel.clear(); renderCols(); return; }
    if(b==='on'||b==='off') refs.forEach(r=>r.c.on=b==='on');
    if(b==='mode'){
      setMode(refs,bb.dataset.v);
      if(bb.dataset.v==='calc') refs.forEach(r=>{ r.c.unit=S.bulkUnit; r.c.ref=S.bulkRef; });
    }
    changed(); toast('열 '+S.csel.size+'개에 적용함','ok'); return;
  }
  if(t.closest('.bulk')) return;
  const row=t.closest('.crow'); if(!row) return;
  const ent=entryOf(row.dataset.k); if(!ent) return;
  const a=t.closest('[data-a]'), act=a&&a.dataset.a;
  if(act==='sel'){ toggleSel(ent.key,e.shiftKey); return; }
  if(act==='on'){ const all=ent.refs.every(r=>r.c.on); ent.refs.forEach(r=>r.c.on=!all); changed(); return; }
  if(act==='mode'){ setMode(ent.refs,a.dataset.v); changed(); return; }
  if(t.closest('select,input,button')) return;
  toggleSel(ent.key,e.shiftKey);               /* 빈 곳을 눌러도 선택됨 */
});
$('#colview').addEventListener('change',e=>{
  const t=e.target, b=t.dataset.b, a=t.dataset.a;
  if(b){
    const refs=selRefs();
    if(b==='type'){ if(!t.value) return; refs.forEach(r=>{ r.c.type=t.value; r.c.prefix=TYPES[t.value].prefix; }); }
    else if(b==='unit'){ S.bulkUnit=t.value; refs.forEach(r=>{ if(r.c.mode==='calc') r.c.unit=t.value; }); }
    else if(b==='ref'){ if(!t.value) return; S.bulkRef=t.value; refs.forEach(r=>{ if(r.c.mode==='calc') r.c.ref=t.value; }); }
    changed(); return;
  }
  const row=t.closest('.crow'); if(!row||!a) return;
  const ent=entryOf(row.dataset.k); if(!ent) return;
  if(a==='type'){ if(!t.value) return; ent.refs.forEach(r=>{ r.c.type=t.value; r.c.prefix=TYPES[t.value].prefix; }); }
  else if(a==='prefix'){ const v=t.value.trim(); ent.refs.forEach(r=>{ r.c.prefix=v||TYPES[r.c.type].prefix; }); }
  else if(a==='blank') ent.refs.forEach(r=>{ r.c.blank=t.value; });
  else if(a==='unit'){ if(!t.value) return; ent.refs.forEach(r=>{ r.c.unit=t.value; }); }
  else if(a==='ref'){ if(!t.value) return; ent.refs.forEach(r=>{ r.c.ref=t.value; }); }
  changed();
});

/* ══════════ 미리보기 (샘플 20행) ══════════
   수십·수백만 행을 다 그리면 브라우저가 멈추므로 화면엔 샘플만. 처리는 항상 전체 행 */
function renderPrev(){
  const el=$('#prevview');
  const pool=selDocs().length?selDocs():S.docs;
  let d=byId(S.focus); if(!d||!pool.includes(d)) d=pool[0];
  if(!d){ el.innerHTML=''; return; }
  const fileChanged=el.dataset.doc!==String(d.id); el.dataset.doc=d.id;
  S.focus=d.id;
  const st=startOf(d), total=Math.max(0,d.grid.length-st);
  const shown=Math.min(total,S.prevRows,PREV_MAX), nc=Math.min(d.cols.length,PREV_COLS);
  const showM=S.showMask&&d.masked, src=showM?d.masked:d.grid;
  const h=[];
  h.push('<div class="ptool" style="padding:10px 14px;border-bottom:1px solid var(--ln)">');
  h.push('<select id="pfile" style="max-width:240px">'+pool.map(x=>'<option value="'+x.id+'"'+(x===d?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>');
  h.push('<div class="seg" id="pmode" style="width:150px"><button data-v="0"'+(!showM?' class="on"':'')+'>원본</button>'
    +'<button data-v="1"'+(showM?' class="on"':'')+(d.masked?'':' disabled title="마스킹 실행 후 볼 수 있음"')+'>결과</button></div>');
  h.push('<span style="flex:1"></span><span class="bd'+(d.rows.size?' w':'')+'">행 통째 마스킹 '+d.rows.size+'개</span>');
  if(d.rows.size) h.push('<button class="btn xs ghost" id="prowclear">행 선택 해제</button>');
  h.push('</div><div class="tw"><table><colgroup><col class="cr">');
  for(let i=0;i<nc;i++) h.push('<col>');
  h.push('</colgroup><thead><tr><th class="rh">#</th>');
  for(let i=0;i<nc;i++){ const c=d.cols[i];
    h.push('<th data-c="'+i+'"'+(c.on?' class="on" style="--mc:var(--m-'+c.mode+')"':'')+' title="'+esc(c.key)+' — 눌러서 켜고 끔">'+esc(c.key)+'</th>'); }
  h.push('</tr></thead><tbody>');
  const fail=d.fail;
  for(let r=st;r<st+shown;r++){
    h.push('<tr data-r="'+r+'"'+(d.rows.has(r)?' class="rsel"':'')+'><td class="rh" data-r="'+r+'" title="이 행 전체를 마스킹">'+(r+1)+'</td>');
    const orow=d.grid[r], mrow=src[r];
    for(let c=0;c<nc;c++){
      const col=d.cols[c], v=mrow?mrow[c]:'';
      let k=col.on||d.rows.has(r)?'on':'';
      if(showM&&String(orow[c])!==String(d.masked[r][c])){
        const isFail=fail&&fail.has(r*65536+c);
        k+=String(v)===''?(isFail?' fail':' gone'):' mk';
      }
      h.push(k?'<td class="'+k.trim()+'"'+(k.indexOf('on')>=0?' style="--mc:var(--m-'+col.mode+')"':'')+'>':'<td>',esc(v),'</td>');
    }
    h.push('</tr>');
  }
  h.push('</tbody></table></div><div class="pnote"><span><b>샘플 '+nf(shown)+'행</b> / 전체 '+nf(total)+'행 · 마스킹은 전체 행에 적용됨'
    +(nc<d.cols.length?' · 열은 앞 '+nc+'개만 표시':'')
    +(d.wb.SheetNames.length>1?' · 다른 시트 '+(d.wb.SheetNames.length-1)+'개는 원본 그대로 저장됨':'')+'</span><span style="flex:1"></span>');
  if(shown<total&&shown<PREV_MAX) h.push('<button class="btn xs" id="pmore">+'+nf(Math.min(PREV_STEP,total-shown,PREV_MAX-shown))+'행 더 보기</button>');
  else if(shown<total) h.push('<span>미리보기는 '+nf(PREV_MAX)+'행까지</span>');
  h.push('</div>');
  morph(el,h.join(''));
  if(fileChanged){ const tw=el.querySelector('.tw'); if(tw){ tw.scrollTop=0; tw.scrollLeft=0; } }
}
$('#prevview').addEventListener('change',e=>{
  if(e.target.id==='pfile'){ S.focus=+e.target.value; S.prevRows=PREV0; renderFiles(); renderPrev(); }
});
$('#prevview').addEventListener('click',e=>{
  const t=e.target, d=byId(S.focus); if(!d) return;
  const pm=t.closest('#pmode button'); if(pm&&!pm.disabled){ S.showMask=pm.dataset.v==='1'; renderPrev(); return; }
  if(t.closest('#pmore')){ S.prevRows=Math.min(S.prevRows+PREV_STEP,PREV_MAX); renderPrev(); return; }
  if(t.closest('#prowclear')){ d.rows.clear(); changed(); return; }
  const th=t.closest('th[data-c]');
  if(th){ const key=d.cols[+th.dataset.c].key, ent=S.sel.has(d.id)?entries().find(x=>x.key===key):null;
    const refs=ent?ent.refs:[{d,c:d.cols[+th.dataset.c]}], all=refs.every(r=>r.c.on);
    refs.forEach(r=>r.c.on=!all); prevChanged(d,+th.dataset.c,null); return; }
  const td=t.closest('td.rh');
  if(td){ const r=+td.dataset.r; d.rows.has(r)?d.rows.delete(r):d.rows.add(r); prevChanged(d,null,r); }
});
/* 미리보기에서 열 머리·행 번호를 눌렀을 때 — 표 전체를 다시 만들지 않고 그 열/행 칸만 고침 (수백 행이어도 즉시) */
function prevChanged(d,c,r){
  const hadRes=!!S.res;
  invalidate(); renderFiles(); renderTarget();
  const tb=$('#prevview tbody');
  if(hadRes||!tb){ renderPrev(); return; }
  const paint=(td,cc,rr)=>{ const col=d.cols[cc], on=col.on||d.rows.has(rr);
    td.className=on?'on':''; if(on) td.style.setProperty('--mc','var(--m-'+col.mode+')'); else td.removeAttribute('style'); };
  if(c!=null){
    const col=d.cols[c], th=$('#prevview thead th[data-c="'+c+'"]');
    if(th){ th.classList.toggle('on',col.on); if(col.on) th.style.setProperty('--mc','var(--m-'+col.mode+')'); else th.removeAttribute('style'); }
    for(const tr of tb.rows){ const cell=tr.cells[c+1]; if(cell) paint(cell,c,+tr.dataset.r); }
  }
  if(r!=null){
    const tr=tb.querySelector('tr[data-r="'+r+'"]'); if(tr){ tr.classList.toggle('rsel',d.rows.has(r));
      for(let i=1;i<tr.cells.length;i++) paint(tr.cells[i],i-1,r); }
    const bd=$('#prevview .ptool .bd'), cl=$('#prowclear'), n=d.rows.size;
    if(bd){ bd.textContent='행 통째 마스킹 '+n+'개'; bd.className='bd'+(n?' w':''); }
    if(n&&!cl&&bd) bd.insertAdjacentHTML('afterend','<button class="btn xs ghost" id="prowclear">행 선택 해제</button>');
    if(!n&&cl) cl.remove();
  }
}

function renderAll(){
  $('#empty').classList.toggle('hide',S.docs.length>0);
  renderFiles(); renderTarget(); setView(S.view); renderCtl();
}
