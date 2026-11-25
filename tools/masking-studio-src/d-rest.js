
/* ══════════ 백그라운드 빌더 (워커) ══════════
   내장된 라이브러리 소스를 그대로 워커에 넘겨 별도 스레드에서 엑셀을 만듦.
   워커를 못 만드는 환경이면 메인 스레드에서 만듦 (결과 같음, 잠깐 멈춤) */
const WK={ w:undefined, seq:0, cbs:new Map(), loaded:{},
  get(){
    if(this.w!==undefined) return this.w;
    this.w=null;
    try{
      const lib=document.getElementById('xlsxlib'); if(!lib||!lib.textContent) return null;
      const w=new Worker(URL.createObjectURL(new Blob([lib.textContent+'\n'+WORKER_BODY],{type:'text/javascript'})));
      w.onmessage=e=>{ const cb=this.cbs.get(e.data.id); if(!cb) return; this.cbs.delete(e.data.id);
        e.data.err?cb.rej(new Error(e.data.err)):cb.res(e.data); };
      w.onerror=()=>{ this.cbs.forEach(cb=>cb.rej(new Error('worker 오류'))); this.cbs.clear(); this.w=null; };
      this.w=w;
    }catch(e){ this.w=null; }
    return this.w;
  },
  call(cmd,payload,transfer){
    const w=this.get(); if(!w) return Promise.reject(new Error('worker 사용 불가'));
    const id=++this.seq;
    return new Promise((res,rej)=>{ this.cbs.set(id,{res,rej}); w.postMessage(Object.assign({id,cmd},payload),transfer||[]); });
  },
  /* 원본을 워커에도 올려둠 — 다른 시트를 원본 그대로 보존하려면 필요. 버퍼는 복사 대신 넘김 */
  preload(key,raw){
    if(!raw||!this.get()) return;
    this.loaded[key]=new Promise(res=>setTimeout(()=>{
      this.call('load',Object.assign({key},raw),raw.buf?[raw.buf]:[]).then(()=>res(true)).catch(()=>res(false));
    },260));
  },
  ready(key){ return this.loaded[key]||Promise.resolve(false); }
};

/* ══════════ 복원 ══════════ */
const R={files:[],map:null,partial:true,outs:[]};
function readyRestore(){ $('#rrun').disabled=!(R.files.length&&R.map&&R.map.size); }
bindDrop('#rdropA','#rfileA',async list=>{
  for(const f of Array.prototype.slice.call(list)){
    await busy('결과 파일 읽는 중…',f.name);
    try{ const {wb}=await readWorkbook(f); R.files.push({name:f.name.replace(/\.[^.]+$/,''),isCsv:isCsvName(f.name),wb}); }
    catch(e){ toast(f.name+' — 열지 못함','bad'); }
  }
  idle();
  if(R.files.length){ $('#rdropA').classList.add('has');
    $('#rtextA').textContent=R.files.length+'개 · '+R.files.map(x=>x.name).join(', ').slice(0,80); }
  countUp($('#r3'),R.files.length); readyRestore();
});
bindDrop('#rdropB','#rfileB',async list=>{
  const f=list[0]; if(!f) return;
  await busy('매칭 파일 읽는 중…',f.name);
  try{ const {rev}=readMappingPairs((await readWorkbook(f)).wb); R.map=rev;
    $('#rtextB').textContent=f.name+' · '+nf(rev.size)+'건'; countUp($('#r1'),rev.size); toast('매칭 파일 읽음 · '+nf(rev.size)+'건','ok'); }
  catch(e){ toast('매칭 파일을 읽지 못함: '+e.message,'bad'); }
  idle(); readyRestore();
});
swBind('#partial',v=>{ R.partial=v; });
$('#rrun').onclick=async()=>{
  const m=R.map;
  await busy('복원 중…',nf(m.size)+'건 매핑 · 파일 '+R.files.length+'개');
  let re=null;
  if(R.partial){
    const keys=Array.from(m.keys()).filter(k=>k.length>=3).sort((a,b)=>b.length-a.length);
    if(keys.length&&keys.length<=8000){ try{ re=new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'); }catch(e){} }
    else if(keys.length>8000) toast('매핑이 많아 문장 속 복원은 건너뛰고 칸 단위로만 복원함','warn');
  }
  let hits=0; R.outs=[];
  try{
    for(const f of R.files){
      const wb=XLSX.utils.book_new(); let first=null;
      for(const sn of f.wb.SheetNames){
        const g=sheetToGrid(f.wb.Sheets[sn]);
        for(let r=0;r<g.length;r++){
          const row=g[r];
          for(let c=0;c<row.length;c++){
            const v=row[c]; if(v===''||v==null) continue;
            const s=String(v);
            if(m.has(s)){ row[c]=m.get(s); hits++; continue; }
            if(re){ re.lastIndex=0; if(re.test(s)){ re.lastIndex=0; row[c]=s.replace(re,x=>m.get(x)||x); hits++; } }
          }
          if(r%4000===3999) await yieldNow();
        }
        if(f.isCsv){ first=first||g; } else XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(g),sn);
      }
      R.outs.push({name:f.name.replace(/_masked$/,'')+'_restored.'+(f.isCsv?'csv':'xlsx'),
                   blob:f.isCsv?aoaToCsvBlob(first||[]):wbToBlob(wb)});
    }
  }catch(e){ console.error(e); toast('복원 중 오류: '+e.message,'bad'); }
  idle();
  countUp($('#r2'),hits);
  let h='';
  if(R.outs.length>1) h+=dlBtn('zip','z',ZIP_ICON,'복원 파일 전부 (ZIP)','파일 '+R.outs.length+'개');
  R.outs.forEach((o,i)=>{ h+=dlBtn('r'+i,'g',DL_ICON,o.name,'복원 파일'); });
  $('#rlist').innerHTML=h;
  toast(hits?('복원 완료 · 셀 '+nf(hits)+'개'):'되돌릴 값을 못 찾음 — 맞는 매칭 파일인지 확인',hits?'ok':'warn');
};
$('#rlist').addEventListener('click',async e=>{
  const b=e.target.closest('[data-dl]'); if(!b) return;
  if(b.dataset.dl==='zip'){ await busy('ZIP 만드는 중…'); try{ await zipAndSave(R.outs,'복원결과_'+stamp()+'.zip'); }catch(err){ toast(err.message,'bad'); } idle(); return; }
  const o=R.outs[+b.dataset.dl.slice(1)]; if(o){ saveBlob(o.blob,o.name); toast('내려받음 · '+o.name,'ok'); }
});

/* ══════════ 사용법 ══════════ */
const HELP=[
 ['기본 흐름','<b>① 파일 올리기</b> → <b>② 가릴 열 켜고 방식 고르기</b> → <b>③ 실행</b> → <b>④ 받기</b><br>'
  +'마스킹 파일만 밖으로 보내고, 결과가 돌아오면 [복원] 탭에서 매칭 파일로 원래 값을 되찾음. 실행은 <code>Ctrl+Enter</code>'],
 ['같은 양식 파일 여러 개를 한 번에','파일을 여러 개 올리면 <b>열 구성이 같은 파일끼리 자동으로 묶여</b> 왼쪽에 보임. '
  +'[묶어서 설정]을 누르거나 체크박스로 여러 파일을 고르면, 가운데에서 한 번 바꾼 설정이 <b>고른 파일 전부에</b> 적용됨<br>'
  +'양식이 다른 파일을 같이 고르면 <b>이름이 같은 열끼리</b> 함께 바뀜. 일부 파일에만 있는 열은 "2/3개 파일에 있음"으로 표시'],
 ['열 여러 개를 한꺼번에','열 줄을 누르거나 왼쪽 네모를 체크하면 선택됨. <code>Shift</code>를 누른 채 누르면 범위로 선택<br>'
  +'위에 나오는 일괄 바에서 <b>켜기·끄기·방식·유형·기간 단위·기준일</b>을 한 번에 적용함. '
  +'[유형으로 고르기]로 예컨대 "날짜" 열만 한꺼번에 고를 수도 있음. 선택 해제는 <code>Esc</code>'],
 ['방식 5가지','<b>형태유지</b> 진짜처럼 보이는 가짜값 (홍길동→서지우)<br><b>토큰</b> <code>NAME_0001</code> 같은 일련번호<br>'
  +'<b>비식별</b> <code>PHONE-JTENHQ</code> — 숫자·@ 를 안 써서 개인정보 형식으로 읽히지 않음. 전화·주민·카드·계좌·이메일의 기본값<br>'
  +'<b>기간</b> 날짜를 만 나이·연령대·년·개월·일로 바꿈<br><b>삭제</b> 값을 없앰 (대체 문자 지정 가능)'],
 ['기간 계산 (생년월일 → 나이)','생년월일은 그 자체가 개인정보라 <b>기준일까지의 기간</b>으로 바꾸면 분석엔 쓰면서 날짜는 사라짐<br>'
  +'단위: <b>만 나이 · 연령대(30대) · 년 · 개월 · 일</b>. 기준일은 열마다 바꿀 수 있고 기본은 오늘<br>'
  +'읽는 날짜: <code>1990-01-05</code> <code>1990.1.5</code> <code>19900105</code> <code>1990년 1월 5일</code> <code>900105</code>, '
  +'<b>주민등록번호</b>(뒷자리 첫 숫자로 1900/2000년대 판별), 엑셀 날짜<br>'
  +'날짜가 기준일보다 뒤면 음수(남은 기간). 못 읽은 값은 빈칸으로 두고 개수와 예시를 알려줌. '
  +'머리글엔 <code>생년월일(만나이·기준 2026-11-25)</code>처럼 표시됨. 결과가 숫자라 <b>매칭표에 안 남고 복원도 안 됨</b>'],
 ['같은 값 = 같은 코드','코드는 <b>값에만</b> 달림. 행·열·파일이 달라도 같은 값이면 같은 코드라 마스킹 후에도 집계·피벗·조인이 그대로 됨. '
  +'서로 다른 값이 같은 코드를 받는 일은 없어서 복원이 정확함<br><b>묶는 기준</b> — 끔: 글자 그대로 / <b>기본</b>: 공백·전각반각 무시 '
  +'(<code>강북차량보상부</code>=<code>강북차량보상부␣</code>) / 강하게: 기호·대소문자 무시, <code>(주)가온</code>=<code>㈜가온</code>=<code>주식회사 가온</code>'],
 ['이전 매칭 파일 이어쓰기','이미 마스킹해서 보낸 결과가 있고 <b>다른 파일을 추가로</b> 마스킹해야 할 때 씀. 그때 받은 매칭 파일을 왼쪽 '
  +'[이전 매칭 파일 이어쓰기]에 넣으면, 거기 있던 값은 <b>예전과 같은 코드</b>를 받고 처음 보는 값만 새 코드를 받음<br>'
  +'여러 개를 넣으면 합쳐서 씀. 새로 받는 매칭 파일엔 이전 코드까지 <b>누적</b>되므로 늘 마지막 매칭 파일 하나만 챙기면 됨'],
 ['개인정보 형식 점검','실행하면 결과 전체(고르지 않은 열 포함)를 훑어 전화·주민·카드·계좌·이메일 <b>형식</b>이 남았는지 알려줌. '
  +'빠뜨린 열을 잡아내는 용도. 걸린 열은 버튼 한 번으로 비식별로 바꿔 다시 실행함'],
 ['받기','파일마다 마스킹 파일 + 공통 매칭 파일 1개. 파일이 여럿이면 <b>[마스킹 파일 전부 (ZIP)]</b>로 한 번에 받음 — '
  +'ZIP엔 매칭 파일이 <b>안 들어감</b>(실수로 같이 보내지 않게). 파일은 실행 직후 미리 만들어 두므로 누르면 바로 받아짐'],
 ['복원','[복원] 탭에 결과 파일(여러 개 가능)과 매칭 파일을 올리면 원래 값으로 되돌림. 문장 속에 섞인 코드도 찾아서 복원 가능. '
  +'삭제·기간 계산한 열은 원본이 없어 복원되지 않음'],
 ['오프라인 · 보안','이 HTML 하나에 모든 게 들어 있음. 인터넷 없이 동작하고 파일은 브라우저 메모리에서만 처리됨. '
  +'<b>매칭 파일은 원본 개인정보 그 자체</b>이므로 본인 PC에만 둘 것']
];
$('#hgrid').innerHTML=HELP.map((x,i)=>'<div class="card hc" style="animation-delay:'+i*30+'ms"><div class="ch"><div class="n">'+(i+1)+'</div><h3>'+x[0]+'</h3></div>'+x[1]+'</div>').join('');

/* ══════════ 단축키 ══════════ */
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&$('#v-mask').classList.contains('on')&&!$('#run').disabled){ e.preventDefault(); $('#run').click(); }
  if(e.key==='Escape'&&S.csel.size&&!/INPUT|SELECT/.test(document.activeElement.tagName)){ S.csel.clear(); renderCols(); }
});
window.addEventListener('beforeunload',e=>{ if(S.res){ e.preventDefault(); e.returnValue=''; } });
renderAll();
console.log('%c마스킹 스튜디오','font:700 15px sans-serif;color:#7080ff','· 오프라인 전용 · 네트워크 전송 코드 없음');
})();
