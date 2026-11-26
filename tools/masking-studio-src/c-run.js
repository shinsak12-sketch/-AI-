
/* ══════════ 실행 옵션 ══════════ */
const NORM_DESC=['글자가 완전히 같아야 같은 값으로 봄',
  '공백 차이·전각/반각·보이지 않는 문자를 무시하고 비교함',
  '기본 + 괄호·점·하이픈·영문 대소문자 무시, (주)/㈜/주식회사도 같게 봄'];
$('#normseg').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  S.norm=+b.dataset.v;
  $$('#normseg button').forEach(x=>x.classList.toggle('on',x===b));
  $('#normtext').textContent=NORM_DESC[S.norm];
  invalidate();
});
swBind('#sweep',v=>{ S.sweep=v; invalidate(); });

/* ══════════ 마스킹 엔진 ══════════
   · 코드는 "값"에만 달림 — 행·열·파일이 달라도 같은 값이면 같은 코드 (집계·조인 가능)
   · 코드는 전체에서 유일하고 원본값과도 겹치지 않음 (복원이 정확함)
   · 한 값이 모드가 다른 여러 열에 걸치면 형식이 가장 강한 모드를 따름 (비식별 > 토큰 > 형태유지)
   · 기간 계산·삭제는 코드를 만들지 않음 (매칭표에 안 남고 복원 안 됨) */
function progress(p){ const b=$('#prog'); b.classList.toggle('on',p>=0&&p<1); b.firstElementChild.style.width=(Math.max(0,p)*100)+'%'; }

async function runMask(){
  const docs=S.docs;
  if(!docs.length) return toast('파일부터 올려야 함','warn');
  if(!docs.some(d=>d.cols.some(c=>c.on)||d.rows.size)) return toast('마스킹할 열을 하나는 켜야 함','warn');
  const NL=S.norm, tgtOf=d=>((r,c)=>d.rows.has(r)||d.cols[c].on);
  const RANK={safe:2,token:1,shape:0};
  const plan=new Map(), origSet=new Set(), variants=new Map();
  let totalRows=0;

  /* 1차: 값 단위 계획 */
  for(const d of docs){
    const st=startOf(d), tgt=tgtOf(d); totalRows+=Math.max(0,d.grid.length-st);
    for(let r=st;r<d.grid.length;r++){
      const row=d.grid[r];
      for(let c=0;c<d.cols.length;c++){
        const v=row[c]; if(v===''||v==null||!tgt(r,c)) continue;
        const raw=String(v); origSet.add(raw);
        const col=d.cols[c];
        if(col.mode==='del'||col.mode==='calc') continue;
        const k=normKey(raw,NL);
        let vs=variants.get(k); if(!vs){ vs=new Set(); variants.set(k,vs); } vs.add(raw);
        const p=plan.get(k);
        if(!p) plan.set(k,{mode:col.mode,type:col.type,prefix:col.prefix,col:col.key,file:d.name,rep:raw});
        else if(RANK[col.mode]>RANK[p.mode]){ p.mode=col.mode; p.type=col.type; p.prefix=col.prefix; p.col=col.key; }
      }
      if((r-st)%6000===5999) await yieldNow();
    }
  }

  const dict=new Map(), rawCode=new Map(), used=new Set(), seq={}, recs=[];
  let cells=0, dels=0, reused=0, swept=0, calcN=0, calcFail=0; const failSamples=[];
  let bookN=null;
  if(S.book){ bookN=new Map(); S.book.forEach((m,o)=>{ used.add(m); const k=normKey(o,NL); if(!bookN.has(k)) bookN.set(k,m); }); }

  function code(k){
    let v=dict.get(k); if(v!==undefined) return v;
    const p=plan.get(k)||{mode:'shape',type:'text',prefix:'TXT',col:'',file:'',rep:k};
    const carried=bookN?bookN.get(k):undefined;
    if(carried!==undefined){ v=carried; reused++; }               /* 이전 매칭 파일에 있던 값 — 같은 코드 그대로 */
    else if(p.mode==='safe'){ const pre=safePrefix(p.prefix,p.type); do{ v=pre+'-'+genSafeBody(); }while(used.has(v)||origSet.has(v)); }
    else if(p.mode==='token'){ const pre=p.prefix||TYPES[p.type].prefix; seq[pre]=(seq[pre]||0)+1; v=pre+'_'+pad(seq[pre],4);
      while(used.has(v)||origSet.has(v)){ seq[pre]++; v=pre+'_'+pad(seq[pre],4); } }
    else{ const g=GEN[p.type]||genShape, src=p.rep; let n=0;
      do{ v=g(src); n++; }while((used.has(v)||origSet.has(v)||v===src)&&n<60);
      if(used.has(v)||origSet.has(v)||v===src){ let j=2; const base=v; do{ v=base+'#'+j++; }while(used.has(v)||origSet.has(v)); } }
    used.add(v); dict.set(k,v);
    recs.push({orig:p.rep,masked:v,type:TYPES[p.type].label,col:p.col,file:p.file});
    return v;
  }

  /* 2차: 치환 */
  const t0=performance.now(); let done=0;
  const refCache=new Map(), REF=s=>{ let R=refCache.get(s); if(!R){ R=refDate(s); refCache.set(s,R); } return R; };
  for(const d of docs){
    const st=startOf(d), tgt=tgtOf(d), masked=d.grid.map(row=>row.slice());
    d.fail=new Set();
    /* 기간 계산 열은 머리글에 무엇으로 바꿨는지 적어둠 (분석할 때 헷갈리지 않게) */
    if(!d.noHeader&&masked[d.headerRow]) d.cols.forEach((col,c)=>{
      if(col.on&&col.mode==='calc') masked[d.headerRow][c]=col.key+'('+UNITS[col.unit].tag+'·기준 '+col.ref+')'; });
    for(let r=st;r<d.grid.length;r++){
      const row=d.grid[r], out=masked[r];
      for(let c=0;c<d.cols.length;c++){
        const v=row[c]; if(v===''||v==null||!tgt(r,c)) continue;
        const col=d.cols[c], raw=String(v);
        /* 문장 속 치환은 "열 단위로 켠 개인정보 유형(이름·전화 등)"의 코드만 퍼뜨림.
           삭제·기간 계산 값, 부서명 같은 일반 값, 행 통째 마스킹 값은 안 고른 열을 절대 건드리지 않음 */
        const spread=col.on&&SENSITIVE.includes(col.type);
        if(col.mode==='calc'){
          const R=REF(col.ref), D=parseDateAny(v,R.y);
          if(!D){ out[c]=''; d.fail.add(r*65536+c); calcFail++; if(failSamples.length<4) failSamples.push(raw); continue; }
          const x=calcValue(D,R,col.unit); out[c]=x; calcN++; cells++;
          continue;
        }
        if(col.mode==='del'){
          const b=col.blank||''; if(raw!==b){ out[c]=b; cells++; dels++; }
          continue;
        }
        const k=normKey(raw,NL), mv=code(k), p=plan.get(k);
        if(spread) rawCode.set(raw,mv);
        out[c]=(p&&p.type==='number'&&typeof v==='number'&&/^-?[\d.]+$/.test(mv))?Number(mv):mv;
        cells++;
      }
      if(++done%3000===0){ progress(done/totalRows); await yieldNow(); }
    }
    d.masked=masked;
  }

  /* 3차: 고르지 않은 열(비고 등) 문장 속에 섞인 개인정보 값만 같은 코드로 치환.
     지우거나(삭제) 기간으로 바꾼 값은 다른 열에서 절대 지우지 않음 */
  const sweptBy=new Map();
  if(S.sweep&&rawCode.size){
    const rep=new Map();
    rawCode.forEach((m,raw)=>{ if(raw.length>=2&&!/^-?[\d,.]+$/.test(raw)) rep.set(raw,m); });
    if(rep.size>8000) toast('바꿀 값이 너무 많아 문장 속 치환은 건너뜀','warn');
    else if(rep.size){
      let re=null;
      try{ re=new RegExp(Array.from(rep.keys()).sort((a,b)=>b.length-a.length)
        .map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'); }catch(e){ re=null; }
      if(re) for(const d of docs){
        const st=startOf(d), tgt=tgtOf(d);
        for(let r=st;r<d.grid.length;r++){
          for(let c=0;c<d.cols.length;c++){
            if(tgt(r,c)) continue;
            const v=d.grid[r][c]; if(typeof v!=='string'||v.length<2) continue;
            re.lastIndex=0; if(!re.test(v)) continue; re.lastIndex=0;
            const nv=v.replace(re,x=>rep.has(x)?rep.get(x):x);
            if(nv!==v){ d.masked[r][c]=nv; swept++;
              const sk=(docs.length>1?d.name+' · ':'')+d.cols[c].key, se=sweptBy.get(sk);
              if(se) se.n++; else sweptBy.set(sk,{n:1,ex:[v,nv]}); }
          }
          if((r-st)%4000===3999) await yieldNow();
        }
      }
    }
  }
  cells+=swept;

  /* 4차: 결과에 개인정보 "형식"이 남았는지 점검 (고르지 않은 열까지 전부) */
  const piiCnt=new Array(PII.length).fill(0), piiBy=new Map(); let piiTotal=0;
  piiCacheReset();
  for(const d of docs){
    const st=startOf(d);
    for(let r=st;r<d.grid.length;r++){
      const row=d.masked[r];
      for(let c=0;c<d.cols.length;c++){
        const v=row[c]; let s;
        if(typeof v==='string') s=v; else if(typeof v==='number'&&Math.abs(v)>=1e9) s=String(v); else continue;
        const k=piiHit(s); if(k<0) continue;
        piiCnt[k]++; piiTotal++;
        const key=d.id+'|'+c; let e=piiBy.get(key);
        if(!e){ e={n:0,kinds:new Set(),d,c}; piiBy.set(key,e); }
        e.n++; e.kinds.add(k);
      }
      if((r-st)%6000===5999) await yieldNow();
    }
  }

  let merged=0; variants.forEach(vs=>{ if(vs.size>1) merged++; });
  progress(1); setTimeout(()=>progress(-1),400);
  S.res={records:recs,totalRows,cells,dels,reused,swept,sweptBy,calcN,calcFail,failSamples,merged,
         pii:{cnt:piiCnt,by:piiBy,total:piiTotal},ms:Math.round(performance.now()-t0)};
  S.showMask=true;
  renderResult(); prebuild(); renderFiles();
  toast('완료 · 셀 '+nf(cells)+'개'+(docs.length>1?' · 파일 '+docs.length+'개 공통 코드':'')
    +(merged?' · 표기 다른 값 '+nf(merged)+'건 묶음':'')+(calcN?' · 기간 계산 '+nf(calcN):'')
    +(reused?' · 이어쓴 코드 '+nf(reused):'')+' · '+S.res.ms+'ms','ok');
}
$('#run').onclick=async()=>{
  if(!S.docs.length) return;
  const rows=S.docs.reduce((n,d)=>n+d.dataRows,0);
  await busy('마스킹 처리 중…',nf(rows)+'행'+(S.docs.length>1?' · 파일 '+S.docs.length+'개':''));
  try{ await runMask(); }catch(e){ console.error(e); toast('처리 중 오류: '+e.message,'bad'); }
  idle();
};

/* ══════════ 결과 ══════════ */
let PII_FLAGS=[];
function renderResult(){
  const r=S.res; $('#rescard').classList.remove('hide');
  const many=S.docs.length>1;
  $('#ctab button[data-v="res"]').disabled=false;
  $('#rvtitle').textContent='마스킹 완료 — 파일 '+S.docs.length+'개';
  $('#rvsub').textContent=nf(r.totalRows)+'행 · 셀 '+nf(r.cells)+'개 바뀜 · '+(r.ms/1000).toFixed(1)+'초'
    +(r.merged?' · 표기 다른 값 '+nf(r.merged)+'건 묶음':'')+(S.book?' · 이전 매칭 파일 이어씀':'');
  $('#rvall').querySelector('span').textContent=many?'마스킹 파일 전부 받기 (ZIP)':'마스킹 파일 받기';
  $('#qall').textContent=many?'마스킹 파일 전부 받기 (ZIP)':'마스킹 파일 받기';
  const hasMap=r.records.length>0||!!S.book;
  $('#rvmap').disabled=!hasMap; $('#qmap').disabled=!hasMap;
  $('#rsum').innerHTML='<div><b>'+nf(r.cells)+'</b><span>바뀐 셀</span></div><div><b>'+nf(r.records.length)+'</b><span>매핑 값</span></div>'
    +'<div><b'+(r.pii.total?' style="color:var(--warn)"':'')+'>'+nf(r.pii.total)+'</b><span>형식 남음</span></div>';
  $('#rsbd').textContent=r.pii.total?'점검 필요':'완료'; $('#rsbd').className='bd '+(r.pii.total?'w':'g');
  setView('res');
  countUp($('#s1'),r.totalRows); countUp($('#s2'),r.cells); countUp($('#s3'),r.records.length);
  countUp($('#s4'),r.calcN); countUp($('#s5'),r.dels); countUp($('#s6'),r.reused);
  const P=r.pii, multi=S.docs.length>1; PII_FLAGS=[];
  if(!P.total) $('#scan').innerHTML='<div class="scan clean"><div class="t"><i></i>개인정보 형식이 남아 있지 않음</div>'
    +'<p>전화·주민·카드·계좌·이메일 형식으로 읽힐 값이 결과 전체에 하나도 없음</p></div>';
  else{
    const list=Array.from(P.by.values()).sort((a,b)=>b.n-a.n).slice(0,8);
    list.forEach(e=>PII_FLAGS.push(e));
    $('#scan').innerHTML='<div class="scan"><div class="t"><i></i>개인정보 형식이 '+nf(P.total)+'셀 남아 있음</div>'
      +'<p>'+P.cnt.map((n,i)=>n?PII[i][0]+' '+nf(n):'').filter(Boolean).join(' · ')+'</p><ul>'
      +list.map(e=>{ const col=e.d.cols[e.c];
        return '<li>'+(multi?esc(e.d.name)+' · ':'')+'<b>'+esc(col.key)+'</b> '+nf(e.n)+'셀 '
          +(col.on?'<span style="color:var(--t3)">('+MODE_LABEL[col.mode]+')</span>':'<span style="color:var(--warn)">(마스킹 안 함)</span>')+'</li>'; }).join('')
      +'</ul><p style="font-size:11px;color:var(--t3)">형태유지는 값만 바꾸고 형식은 그대로라 형식 검사에 걸림. 비식별로 바꾸면 숫자·@ 를 안 씀</p>'
      +'<button class="btn xs" id="fixsafe" style="margin-top:6px">위 열 전부 비식별로 바꾸고 다시 실행</button></div>';
  }
  let note=r.calcFail?'<div class="scan" style="margin-bottom:8px"><div class="t"><i></i>기간 계산 못한 값 '+nf(r.calcFail)+'개 — 빈칸 처리함</div>'
    +'<p>날짜로 읽을 수 없는 값: '+r.failSamples.map(s=>'<code>'+esc(s)+'</code>').join(' ')+'</p></div>':'';
  if(r.sweptBy&&r.sweptBy.size){
    const li=[...r.sweptBy].sort((a,b)=>b[1].n-a[1].n).slice(0,6).map(([k,o])=>'<li><b>'+esc(k)+'</b> '+nf(o.n)+'칸 — <code>'+esc(String(o.ex[0]).slice(0,28))+'</code> → <code>'+esc(String(o.ex[1]).slice(0,28))+'</code></li>').join('');
    note+='<div class="scan clean"><div class="t"><i></i>안 고른 열 문장 속 개인정보 '+nf(r.swept)+'칸 치환</div><ul>'+li+'</ul>'
      +'<p style="font-size:11px;color:var(--t3)">이름·전화 같은 개인정보 코드만 적용함. 삭제·기간 계산한 값은 다른 열에서 안 지움</p></div>';
  }
  $('#calcnote').innerHTML=note;
  renderDls();
}
$('#scan').addEventListener('click',async e=>{
  if(!e.target.closest('#fixsafe')||!PII_FLAGS.length) return;
  PII_FLAGS.forEach(f=>{ const c=f.d.cols[f.c]; if(c.mode!=='del'&&c.mode!=='calc'){ c.mode='safe'; c.on=true; } });
  invalidate(); renderAll();
  await busy('다시 마스킹하는 중…'); try{ await runMask(); }catch(err){ toast(err.message,'bad'); } idle();
});

/* ══════════ 파일 만들기 · 내려받기 ══════════
   엑셀 직렬화는 통째로 멈추는 작업이라 별도 스레드(워커)에서 만들고,
   마스킹이 끝나자마자 미리 만들어 둠 → 누르면 바로 받아짐 */
const MAP_CSV_OVER=20000;
const DL_ICON='<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>';
const MAP_ICON='<svg class="i" viewBox="0 0 24 24"><path d="M10 7H6a3 3 0 000 6h4"/><path d="M14 7h4a3 3 0 010 6h-4"/><path d="M9 10h6"/></svg>';
const ZIP_ICON='<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v4M12 9v2M12 13v2"/></svg>';
function aoaToCsvBlob(aoa){ return new Blob(['﻿'+csvFromAoa(aoa)],{type:'text/csv;charset=utf-8'}); }
function wbToBlob(wb){ return new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/octet-stream'}); }
function toBlob(r){ return r.text!=null?new Blob(['﻿'+r.text],{type:'text/csv;charset=utf-8'}):new Blob([r.buf],{type:'application/octet-stream'}); }
const outName=d=>d.name+(d.isCsv?'_masked.csv':'_masked.xlsx');
function mapName(csv){ const base=S.docs.length===1?S.docs[0].name+'_mapping':'매칭파일_'+stamp();
  return base+'.'+(csv??(S.res&&(S.res.records.length+(S.book?S.book.size:0))>MAP_CSV_OVER)?'csv':'xlsx'); }
function buildMaskedMain(d){
  if(d.isCsv) return aoaToCsvBlob(d.masked);
  const wb=XLSX.utils.book_new();
  d.wb.SheetNames.forEach(n=>XLSX.utils.book_append_sheet(wb,n===d.sheet?XLSX.utils.aoa_to_sheet(d.masked):d.wb.Sheets[n],n));
  return wbToBlob(wb);
}
function buildMappingMain(pl){
  if(pl.asCsv) return aoaToCsvBlob(pl.map);
  const wb=XLSX.utils.book_new(), m=XLSX.utils.aoa_to_sheet(pl.map), i=XLSX.utils.aoa_to_sheet(pl.info);
  m['!cols']=pl.mcols; i['!cols']=pl.icols;
  XLSX.utils.book_append_sheet(wb,m,'MAPPING'); XLSX.utils.book_append_sheet(wb,i,'INFO');
  return wbToBlob(wb);
}
function mappingPayload(){
  const map=[['원본값','마스킹값','유형','열','파일']], seen=new Set();
  S.res.records.forEach(r=>{ seen.add(r.orig); map.push([r.orig,r.masked,r.type,r.col,r.file]); });
  /* 이어쓴 코드북 중 이번 파일에 안 나온 것도 남겨서, 다음에 이 파일 하나만 넣으면 되게 함 */
  if(S.book) S.book.forEach((m,o)=>{ if(!seen.has(o)) map.push([o,m,'(이전 코드)','','']); });
  const asCsv=map.length-1>MAP_CSV_OVER;
  if(asCsv) return {asCsv:true,map};
  const info=[['마스킹 스튜디오 매칭 파일'],[],
    ['생성 일시',new Date().toLocaleString('ko-KR')],
    ['파일',S.docs.map(d=>d.name).join(', ')],
    ['같은 값 묶는 기준',NORM_LABEL[S.norm]],
    ['이어쓴 매칭 파일',S.bookNames.join(', ')||'없음'],
    ['매핑 항목 수',map.length-1],[]];
  groups().forEach((g,gi)=>{
    const c=g[0].cols, f=m=>c.filter(x=>x.on&&x.mode===m);
    info.push(['양식 '+letter(gi),g.map(d=>d.name).join(', ')]);
    const coded=c.filter(x=>x.on&&['shape','token','safe'].includes(x.mode));
    if(coded.length) info.push(['  마스킹 열',coded.map(x=>x.key+'('+TYPES[x.type].label+'/'+MODE_LABEL[x.mode]+')').join(', ')]);
    if(f('calc').length) info.push(['  기간 계산 열 (복원 불가)',f('calc').map(x=>x.key+'('+UNITS[x.unit].label+'·기준 '+x.ref+')').join(', ')]);
    if(f('del').length) info.push(['  삭제 열 (복원 불가)',f('del').map(x=>x.key+(x.blank?'→"'+x.blank+'"':'→공란')).join(', ')]);
  });
  info.push([],['※ 원본 개인정보를 담고 있음. 외부 반출 금지'],
    ['※ [복원] 탭에 결과 파일과 함께 올리면 원래 값으로 되돌림'],
    ['※ 다음에 다른 파일을 같은 코드로 마스킹하려면 [이전 매칭 파일 이어쓰기]에 이 파일을 넣으면 됨']);
  return {asCsv:false,map,info,mcols:[{wch:26},{wch:26},{wch:12},{wch:20},{wch:22}],icols:[{wch:24},{wch:80}]};
}
function dlBtn(k,cls,icon,title,sub){
  return '<button class="dl '+cls+'" data-dl="'+k+'"><div class="ic">'+icon+'</div><div class="tx"><b title="'+esc(title)+'">'+esc(title)+'</b><span>'+sub+'</span></div><span class="rd" id="rd-'+k+'"></span></button>';
}
function renderDls(){
  const r=S.res; let h='';
  if(S.docs.length>1) h+=dlBtn('zip','z',ZIP_ICON,'마스킹 파일 전부 (ZIP)','파일 '+S.docs.length+'개 · 매칭 파일은 안 들어감');
  S.docs.forEach(d=>{ h+=dlBtn('f'+d.id,'',DL_ICON,outName(d),'마스킹 파일'); });
  const seen=new Set(r.records.map(x=>x.orig)); let total=r.records.length;
  if(S.book) S.book.forEach((m,o)=>{ if(!seen.has(o)) total++; });
  if(total) h+=dlBtn('map','g',MAP_ICON,mapName(),'매칭 파일 · '+nf(total)+'건'+(S.book?' · 이전 코드 누적':''));
  else h+='<div class="warnbox">바꾼 값이 삭제·기간 계산뿐이라 매칭 파일은 없음</div>';
  $('#dlist').innerHTML=h;
}
const ready=k=>{ const el=$('#rd-'+k); if(el) el.textContent='준비됨'; };
function prebuild(){
  S.docs.forEach(d=>{
    const name=outName(d);
    d.file=(d.isCsv?Promise.resolve(true):WK.ready(d.id)).then(ok=>{
      if(!ok) throw 0;
      return WK.call('build',{key:d.id,name:d.sheet,aoa:d.masked,isCsv:d.isCsv}).then(r=>({blob:toBlob(r),name}));
    }).catch(()=>({blob:buildMaskedMain(d),name}));
    d.file.then(()=>ready('f'+d.id)).catch(()=>{});
  });
  if(S.res.records.length||S.book){
    const pl=mappingPayload(), name=mapName(pl.asCsv);
    S.mapFile=WK.call('table',pl).then(r=>({blob:toBlob(r),name})).catch(()=>({blob:buildMappingMain(pl),name}));
    S.mapFile.then(()=>ready('map')).catch(()=>{});
  }
  Promise.all(S.docs.map(d=>d.file)).then(()=>ready('zip')).catch(()=>{});
}
async function zipAndSave(items,name){
  const files=[];
  for(const f of items) files.push({name:f.name,data:new Uint8Array(await f.blob.arrayBuffer())});
  saveBlob(await makeZip(files),name);
  return files.length;
}
$('#qview').onclick=()=>setView('res');
$('#v-mask').addEventListener('click',async e=>{
  const b=e.target.closest('[data-dl]'); if(!b||!S.res||b.disabled) return;
  let k=b.dataset.dl;
  if(k==='all') k=S.docs.length>1?'zip':'f'+S.docs[0].id;
  if(k==='zip'){
    await busy('ZIP 만드는 중…','파일 '+S.docs.length+'개');
    try{ const n=await zipAndSave(await Promise.all(S.docs.map(d=>d.file)),'마스킹결과_'+stamp()+'.zip'); toast('ZIP 내려받음 · 파일 '+n+'개','ok'); }
    catch(err){ toast('ZIP 실패: '+err.message,'bad'); }
    idle(); return;
  }
  const p=k==='map'?S.mapFile:(byId(+k.slice(1))||{}).file; if(!p) return;
  const t=setTimeout(()=>busy('파일 만드는 중…','거의 다 됨'),150);
  try{ const f=await p; saveBlob(f.blob,f.name); toast(k==='map'?'매칭 파일 내려받음 · 외부 반출 금지':'내려받음 · '+f.name,k==='map'?'warn':'ok'); }
  catch(err){ toast('파일 생성 실패','bad'); }
  clearTimeout(t); idle();
});

/* ══════════ 매칭 파일 읽기 (이어쓰기 · 복원 공용) ══════════ */
function readMappingPairs(wb){
  const sn=wb.SheetNames.includes('MAPPING')?'MAPPING':wb.SheetNames[0];
  const aoa=sheetToGrid(wb.Sheets[sn]);
  if(!aoa.length) throw new Error('빈 파일');
  const head=aoa[0].map(v=>String(v).replace(/^﻿/,'').trim());
  let oi=head.indexOf('원본값'), mi=head.indexOf('마스킹값');
  if(oi<0||mi<0) throw new Error('원본값/마스킹값 열이 없음 — 이 도구가 만든 매칭 파일인지 확인');
  const fwd=new Map(), rev=new Map();
  for(let i=1;i<aoa.length;i++){
    const o=aoa[i][oi], k=aoa[i][mi];
    if(k===''||k==null||o===''||o==null) continue;
    const os=String(o), ks=String(k);
    rev.set(ks,os); if(!fwd.has(os)) fwd.set(os,ks);
  }
  if(!rev.size) throw new Error('매핑 항목이 없음');
  return {fwd,rev};
}

/* ══════════ 이전 매칭 파일 이어쓰기 ══════════
   이미 마스킹해서 내보낸 결과가 있고 다른 파일을 추가로 마스킹해야 할 때,
   그때 받은 매칭 파일을 넣으면 거기 있던 값은 같은 코드를 그대로 다시 씀.
   여러 개를 넣으면 합쳐서 씀. 새로 받는 매칭 파일엔 이전 코드까지 누적됨 */
$('#bookbtn').onclick=()=>$('#bookfile').click();
$('#bookfile').onchange=async e=>{
  const fs=Array.prototype.slice.call(e.target.files); e.target.value='';
  if(!fs.length) return;
  await busy('매칭 파일 읽는 중…',fs.length>1?fs.length+'개':fs[0].name);
  const book=S.book?new Map(S.book):new Map(), owner=new Map();
  book.forEach((m,o)=>owner.set(m,o));
  let ok=0, add=0, clash=0;
  for(const f of fs){
    try{
      const {fwd}=readMappingPairs((await readWorkbook(f)).wb);
      fwd.forEach((m,o)=>{
        if(book.has(o)) return;
        if(owner.has(m)&&owner.get(m)!==o){ clash++; return; }   /* 같은 코드가 다른 값에 쓰였으면 복원이 꼬이므로 뺌 */
        book.set(o,m); owner.set(m,o); add++;
      });
      S.bookNames.push(f.name); ok++;
    }catch(err){ toast(f.name+' — '+err.message,'bad'); }
  }
  idle();
  if(!ok) return;
  S.book=book; renderBook(); invalidate();
  toast('코드 '+nf(add)+'건 이어씀 · 총 '+nf(book.size)+'건'+(clash?' · 코드가 겹친 '+nf(clash)+'건은 뺌':''),clash?'warn':'ok');
};
$('#bookclear').onclick=()=>{ S.book=null; S.bookNames=[]; renderBook(); invalidate(); toast('이어쓰기 해제함','ok'); };
function renderBook(){
  const on=!!S.book;
  $('#book').classList.toggle('on',on);
  $('#bookbd').textContent=on?nf(S.book.size)+'건':'선택';
  $('#bookbd').className='bd'+(on?' g':'');
  $('#bookclear').classList.toggle('hide',!on);
  $('#booktext').innerHTML=on
    ? '<b>'+esc(S.bookNames[0])+'</b>'+(S.bookNames.length>1?' 외 '+(S.bookNames.length-1)+'개':'')+' — 여기 있는 값은 <b>예전과 같은 코드</b>를 받고, 처음 보는 값만 새 코드를 받음'
    : '예전에 받은 매칭 파일을 넣으면, 거기 있던 값은 <b>같은 코드</b>를 그대로 받음. 추가 파일을 기존 결과와 합쳐 분석할 때 씀';
}
