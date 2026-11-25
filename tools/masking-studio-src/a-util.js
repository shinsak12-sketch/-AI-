/* ══════════════════════════════════════════════════════════════
   마스킹 스튜디오 — 오프라인 개인정보 비식별화 도구
   모든 처리는 브라우저 메모리에서만 일어남. 네트워크 코드 없음.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
const rnd = n => Math.floor(Math.random()*n);
const pick = a => a[rnd(a.length)];
const pad = (n,w) => String(n).padStart(w,'0');
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const yieldNow = () => new Promise(r=>setTimeout(r,0));
const nf = n => Number(n).toLocaleString('ko-KR');

/* ── 토스트 ── */
function toast(msg,kind){
  const el=document.createElement('div');
  el.className='toast '+(kind||'');
  el.innerHTML='<i></i><span>'+esc(msg)+'</span>';
  $('#toasts').appendChild(el);
  while($('#toasts').children.length>2) $('#toasts').firstChild.remove();
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),320);},kind==='bad'?4800:3000);
}
/* ── 처리 중 오버레이 — 화면에 그려진 다음 무거운 일을 시작해야 멈춘 것처럼 안 보임 ── */
function busy(title,sub){
  $('#busyt').textContent=title; $('#busys').textContent=sub||'';
  $('#busy').classList.add('on');
  return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,0))));
}
function idle(){ $('#busy').classList.remove('on'); }

/* ── 테마 ── */
const SUN='<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>';
const MOON='<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
$('#theme').onclick=()=>{
  const r=document.documentElement, light=r.getAttribute('data-theme')==='light';
  r.setAttribute('data-theme',light?'dark':'light');
  $('#ticon').innerHTML=light?MOON:SUN;
  try{ localStorage.setItem('ms-theme',light?'dark':'light'); }catch(e){}
};
try{ if(localStorage.getItem('ms-theme')==='light') $('#theme').click(); }catch(e){}

/* ── 상단 탭 ── */
$$('.tab').forEach(t=>t.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.toggle('on',x===t));
  $$('.view').forEach(v=>v.classList.toggle('on',v.id==='v-'+t.dataset.v));
});

/* ── 버튼 물결 ── */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest('.btn'); if(!b||b.disabled) return;
  const r=b.getBoundingClientRect(), d=Math.max(r.width,r.height);
  const i=document.createElement('span'); i.className='rip';
  i.style.cssText='width:'+d+'px;height:'+d+'px;left:'+(e.clientX-r.left-d/2)+'px;top:'+(e.clientY-r.top-d/2)+'px';
  b.appendChild(i); setTimeout(()=>i.remove(),620);
});
function swBind(sel,fn){ const el=$(sel); el.onclick=()=>{ el.classList.toggle('on'); fn(el.classList.contains('on')); }; }

/* ── 숫자 올라가는 애니메이션 ── */
function countUp(el,to){
  if(!el) return;
  to=Math.max(0,Math.round(to)||0);
  if(el._raf){ cancelAnimationFrame(el._raf); el._raf=0; }
  const from=Math.max(0,parseInt(String(el.textContent).replace(/[^\d]/g,''),10)||0);
  if(from===to){ el.textContent=nf(to); return; }
  const t0=performance.now(), dur=480;
  /* 무거운 작업 직후엔 rAF 시각이 t0보다 이를 수 있어 0~1로 묶어둠 */
  const step=t=>{
    const p=Math.min(1,Math.max(0,(t-t0)/dur)), e=1-Math.pow(1-p,3);
    el.textContent=nf(Math.round(from+(to-from)*e));
    el._raf=p<1?requestAnimationFrame(step):0;
  };
  el._raf=requestAnimationFrame(step);
}

/* ══════════ 기간 계산 ══════════
   생년월일 같은 날짜는 그 자체가 개인정보임. 기준일과의 차이(만 나이·연령대·년·개월·일)로
   바꾸면 분석에 필요한 정보는 남고 날짜는 사라짐. 결과는 숫자이므로 매칭표에 남지 않고 복원도 안 됨 */
const TODAY=(()=>{ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1,2)+'-'+pad(d.getDate(),2); })();
const UNITS={
  age  :{label:'만 나이', tag:'만나이'},
  band :{label:'연령대',  tag:'연령대'},
  year :{label:'년',      tag:'경과 연수'},
  month:{label:'개월',    tag:'경과 개월'},
  day  :{label:'일',      tag:'경과 일수'}
};
function ymd(y,m,d){
  if(!(m>=1&&m<=12&&d>=1&&d<=31)) return null;
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCMonth()===m-1 ? {y,m,d} : null;
}
/* 받는 형식: 2021-01-10 · 2021.1.10 · 2021/01/10 · 2021년 1월 10일 · 20210110 · 2021-01(1일로 봄)
   · 900101(앞 두 자리로 세기 추정) · 주민등록번호 900101-1234567(뒷자리 첫 숫자로 세기 판별)
   · 엑셀 날짜 일련번호 */
function parseDateAny(v,refY){
  if(v==null||v==='') return null;
  if(typeof v==='number'){
    if(Number.isInteger(v)&&v>=10000101&&v<=21001231) return ymd(Math.floor(v/10000),Math.floor(v/100)%100,v%100);
    if(v>0&&v<80000){ const t=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);
      return {y:t.getUTCFullYear(),m:t.getUTCMonth()+1,d:t.getUTCDate()}; }
    return null;
  }
  const s=String(v).normalize('NFKC').trim();
  let m;
  if(s.replace(/\D/g,'').length===13 && (m=s.match(/^(\d{2})(\d{2})(\d{2})\s*-?\s*(\d)\d{6}$/))){
    const g=+m[4], c=(g===1||g===2||g===5||g===6)?1900:(g===3||g===4||g===7||g===8)?2000:1800;
    return ymd(c+(+m[1]),+m[2],+m[3]);
  }
  if((m=s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*(?:[-./월]\s*(\d{1,2}))?/))) return ymd(+m[1],+m[2],m[3]?+m[3]:1);
  if((m=s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ymd(+m[1],+m[2],+m[3]);
  if((m=s.match(/^(\d{2})(\d{2})(\d{2})$/))){ const yy=+m[1]; return ymd((yy<=refY%100?2000:1900)+yy,+m[2],+m[3]); }
  return null;
}
const dcmp=(a,b)=>a.y-b.y||a.m-b.m||a.d-b.d;
function fullYears(a,b){ let y=b.y-a.y; if(b.m<a.m||(b.m===a.m&&b.d<a.d)) y--; return y; }
function fullMonths(a,b){ let n=(b.y-a.y)*12+(b.m-a.m); if(b.d<a.d) n--; return n; }
/* 기준일 − 날짜. 날짜가 기준일보다 뒤면 음수 (예: 남은 기간) */
function calcValue(D,R,unit){
  if(unit==='day') return Math.round((Date.UTC(R.y,R.m-1,R.d)-Date.UTC(D.y,D.m-1,D.d))/86400000);
  const neg=dcmp(D,R)>0, a=neg?R:D, b=neg?D:R, sg=neg?-1:1;
  if(unit==='month') return sg*fullMonths(a,b);
  const y=sg*fullYears(a,b);
  if(unit==='band') return y<0?'':(y<10?'10세 미만':(Math.floor(y/10)*10)+'대');
  return y;
}
function refDate(s){ const p=parseDateAny(s||TODAY,2000); return p||parseDateAny(TODAY,2000); }

/* ══════════ ZIP 만들기 ══════════
   여러 파일을 한 번에 받게 묶음. 내장 라이브러리의 ZIP은 한글 파일명을 깨뜨려서
   파일명이 UTF-8임을 알리는 표시(0x0800)를 세운 ZIP을 직접 만듦.
   압축은 브라우저 내장 기능(deflate-raw)을 쓰고, 없으면 무압축으로 담음 */
const CRC_T=(()=>{ const t=new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
async function deflateRaw(u8){
  if(typeof CompressionStream==='undefined') return null;
  try{ return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
  catch(e){ return null; }
}
async function makeZip(files){
  const enc=new TextEncoder(), now=new Date();
  const dt=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xFFFF;
  const dd=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
  const parts=[], cent=[]; let off=0;
  for(const f of files){
    const nm=enc.encode(f.name), data=f.data, crc=crc32(data);
    let body=await deflateRaw(data), method=8;
    if(!body||body.length>=data.length){ body=data; method=0; }
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,method,true);
    lh.setUint16(10,dt,true); lh.setUint16(12,dd,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,body.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,nm.length,true);
    parts.push(new Uint8Array(lh.buffer),nm,body);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true);
    ch.setUint16(10,method,true); ch.setUint16(12,dt,true); ch.setUint16(14,dd,true); ch.setUint32(16,crc,true);
    ch.setUint32(20,body.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,nm.length,true); ch.setUint32(42,off,true);
    cent.push(new Uint8Array(ch.buffer),nm);
    off+=30+nm.length+body.length;
  }
  const csz=cent.reduce((n,p)=>n+p.length,0), end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
  end.setUint32(12,csz,true); end.setUint32(16,off,true);
  return new Blob(parts.concat(cent,[new Uint8Array(end.buffer)]),{type:'application/zip'});
}
function saveBlob(blob,name){
  const u=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=u; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(u); },3000);
}
function stamp(){ const d=new Date(); return d.getFullYear()+pad(d.getMonth()+1,2)+pad(d.getDate(),2)+'_'+pad(d.getHours(),2)+pad(d.getMinutes(),2); }

