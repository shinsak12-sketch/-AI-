/* ══════════ 유형 정의 ══════════ */
const TYPES={
  name   :{label:'이름',        prefix:'NAME'},
  phone  :{label:'전화번호',    prefix:'PHONE'},
  email  :{label:'이메일',      prefix:'EMAIL'},
  rrn    :{label:'주민등록번호',prefix:'RRN'},
  card   :{label:'카드번호',    prefix:'CARD'},
  account:{label:'계좌번호',    prefix:'ACCT'},
  address:{label:'주소',        prefix:'ADDR'},
  id     :{label:'사번 / ID',   prefix:'ID'},
  number :{label:'숫자',        prefix:'NUM'},
  date   :{label:'날짜',        prefix:'DATE'},
  text   :{label:'일반 텍스트', prefix:'TXT'}
};
const SENSITIVE=['name','phone','email','rrn','card','account','address','id'];
/* 값 자체가 정해진 형식을 갖는 유형 — 형식 검사 시스템이 패턴으로 잡아내는 것들 */
const PATTERNED=['phone','rrn','card','account','email'];
const MODE_LABEL={shape:'형태유지',token:'토큰',safe:'비식별형',calc:'기간 계산',del:'삭제'};

/* ══════════ 값 묶기(정규화) ══════════
   실무 데이터는 같은 대상인데 표기가 조금씩 다름.
   "강북차량보상부 " / "강북차량보상부" / "강북 차량보상부" 가 다 다른 코드를 받으면
   정작 집계할 때 세 조직으로 갈라져버림. 묶는 기준을 단계로 고를 수 있게 함.
     0 끔    — 글자가 완전히 같아야 같은 값
     1 기본  — 공백 차이(앞뒤·중간·개수)와 전각/반각, 보이지 않는 문자를 무시
     2 강하게 — 기본 + 괄호·점·하이픈 같은 기호 무시, 영문 대소문자 무시,
                (주)/㈜/주식회사 표기 통일 */
const ZWSP=/[​-‍﻿­]/g;
function normKey(s,level){
  if(!level) return s;
  let t=s.normalize('NFKC').replace(ZWSP,'').replace(/\s+/g,'');
  if(level>1){
    t=t.replace(/㈜|\(주\)|\(주식회사\)/g,'주식회사')
       .replace(/[()[\]{}<>·・,.\-_/\\|]/g,'')
       .toLowerCase();
  }
  return t;
}
const NORM_LABEL=['끔','기본','강하게'];

/* ══════════ CSV 직접 처리 ══════════
   CSV를 라이브러리의 시트 객체로 바꿔서 오가면 셀 하나하나가 객체가 되어
   수백만 셀에서 수십 초가 걸림. CSV는 그냥 텍스트이므로 직접 읽고 씀.
   규칙은 표준(RFC 4180) 그대로 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고
   안쪽 따옴표는 두 번 씀 */
function csvFromAoa(aoa){
  const out=new Array(aoa.length);
  for(let r=0;r<aoa.length;r++){
    const row=aoa[r], m=row.length, cells=new Array(m);
    for(let c=0;c<m;c++){
      const v=row[c];
      if(v==null||v===''){ cells[c]=''; continue; }
      const s=typeof v==='string'?v:String(v);
      cells[c]=(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0||s.indexOf('\r')>=0)
        ? '"'+s.replace(/"/g,'""')+'"' : s;
    }
    out[r]=cells.join(',');
  }
  return out.join('\n');
}
function csvToAoa(text){
  const rows=[]; let row=[], i=0, w=0; const n=text.length;
  while(i<n){
    let val;
    if(text.charCodeAt(i)===34){                 // 따옴표로 감싼 값
      let out='', j=i+1;
      for(;;){
        const k=text.indexOf('"',j);
        if(k<0){ out+=text.slice(j); j=n; break; }
        if(text.charCodeAt(k+1)===34){ out+=text.slice(j,k+1); j=k+2; continue; }
        out+=text.slice(j,k); j=k+1; break;
      }
      val=out; i=j;
    }else{                                        // 일반 값 — 구분자까지 통째로 잘라냄
      let j=i;
      while(j<n){ const c=text.charCodeAt(j); if(c===44||c===10||c===13) break; j++; }
      val=text.slice(i,j); i=j;
    }
    row.push(val);
    const c=i<n?text.charCodeAt(i):-1;
    if(c===44){ i++; continue; }                  // 다음 칸
    if(row.length>w) w=row.length;
    rows.push(row); row=[];
    if(c===13){ i++; if(text.charCodeAt(i)===10) i++; }
    else if(c===10){ i++; }
    else break;
  }
  if(row.length){ if(row.length>w) w=row.length; rows.push(row); }
  /* 파일 끝 줄바꿈이 만든 빈 줄 하나는 버림 */
  const last=rows[rows.length-1];
  if(last && last.length===1 && last[0]==='') rows.pop();
  return {rows,w};
}


/* ══════════ 한국 성씨 사전 (이름 판별 + 생성 양쪽에 씀) ══════════ */
const SUR=['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','전','홍','고','문','양','손','배','백','허','유','남','심','노','하','곽','성','차','주','우','구','민','유','진','지','엄','채','원','천','방','공','현','함','변','염','여','추','도','소','석','선','설','마','길','연','위','표','명','기','반','왕','금','옥','육','인','맹','제','모','남궁','선우','황보'];
const SURSET=new Set(SUR);
const SUR2=['남궁','선우','황보','제갈','독고','사공'];
const GIVEN1=['민','준','서','현','우','진','호','영','수','연','지','아','윤','은','하','원','석','규','태','성','재','희','철','경','상','도','건','찬','빈','솔'];
const GIVEN2=['민준','서연','도윤','지우','하은','시우','예준','수아','주원','지호','서준','하윤','지안','은우','유진','지훈','현우','승민','준서','다은','수빈','예린','채원','민서','지민','태현','상현','동현','영수','미경','정호','경수','성민','재원','우진','시윤','건우','도현','선우','유나','소율','아윤','서윤','나윤','가온','시현','연우','지원','현서','예서','수현','정우','승현','태민','주하','하람','은서','준혁','민재','도영'];


/* ══════════ 자동 감지 ══════════ */
const RE={
  phone  :/^(0\d{1,2}|1\d{3})[-. ]?\d{3,4}[-. ]?\d{4}$/,
  email  :/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/,
  rrn    :/^\d{6}[-\s]?[1-4]\d{6}$/,
  card   :/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
  account:/^\d{2,6}-\d{2,6}-\d{2,8}$|^\d{10,14}$/,
  name   :/^[가-힣]{2,5}$/,
  date   :/^\d{4}[-./]\d{1,2}[-./]\d{1,2}([ T].*)?$/,
  number :/^-?[\d,]+(\.\d+)?$/,
  id     :/^[A-Za-z]{0,4}[-_]?\d{3,12}$/,
  address:/(특별시|광역시|특별자치|[가-힣]{2,}(시|군|구))\s|[가-힣]+(로|길)\s?\d/
};
const HINT=[
  [/(주민|주민등록|rrn|ssn|jumin)/i,'rrn'],
  [/(휴대|핸드폰|전화|연락처|폰번|tel|phone|mobile|hp)/i,'phone'],
  [/(이메일|메일|email|e-mail)/i,'email'],
  [/(카드번호|카드|card)/i,'card'],
  [/(계좌|은행|account|bank)/i,'account'],
  [/(주소|거주지|소재지|address|addr)/i,'address'],
  [/(성명|이름|고객명|담당자|신청인|대표자|성함|name)/i,'name'],
  [/(사번|사원번호|직원번호|회원번호|고객번호|계약번호|employee|empno)/i,'id'],
  [/(생년월일|생일|일자|날짜|date|dt)$/i,'date']
];
const NOTNAME=/(팀|본부|사업부|파트|센터|지사|지점|그룹|위원회|협회|공사|법인|영업소|사무소|사업소|부서|직급|직책)$/;
function isKoreanName(v){
  if(!RE.name.test(v)||NOTNAME.test(v)) return false;
  return SURSET.has(v[0])||SURSET.has(v.slice(0,2));
}
function detectType(header, vals){
  const h=String(header||'');
  for(const [re,t] of HINT) if(re.test(h)) return t;
  const s=vals.filter(v=>v!=='' && v!=null).slice(0,220).map(v=>String(v).trim());
  if(!s.length) return 'text';
  const hit=t=>s.filter(v=>RE[t].test(v)).length/s.length;
  for(const t of ['rrn','email','phone','card','date']) if(hit(t)>=0.6) return t;
  if(s.filter(v=>RE.account.test(v)&&!RE.date.test(v)).length/s.length>=0.6) return 'account';
  if(hit('address')>=0.5) return 'address';
  if(s.filter(isKoreanName).length/s.length>=0.75) return 'name';
  if(hit('number')>=0.9) return 'number';
  if(hit('id')>=0.7) return 'id';
  return 'text';
}

/* ══════════ 형태유지 생성기 ══════════ */
const SYL=['민','서','지','예','하','도','시','주','유','준','건','현','수','승','은','채','다','가','나','소','윤','태','재','성','우','연','진','정','경','상','동','영','호','석','규','희','원','빈','솔','아','라','미','숙','철','보','근','병','종','창','광','만','용','인','선','혜','람','결','율','온','담','늘','설','린','윤','겸','율','후','안','겨','슬'];
const AREA=[
  ['서울특별시',['강남구','서초구','송파구','마포구','성동구','용산구','종로구','영등포구','동작구','광진구','노원구','은평구','강서구','관악구']],
  ['부산광역시',['해운대구','수영구','부산진구','동래구','남구','사하구','금정구']],
  ['대구광역시',['수성구','달서구','중구','북구','동구']],
  ['인천광역시',['연수구','남동구','부평구','서구','미추홀구']],
  ['광주광역시',['서구','북구','광산구','남구']],
  ['대전광역시',['유성구','서구','중구','대덕구']],
  ['울산광역시',['남구','중구','북구','울주군']],
  ['세종특별자치시',['']],
  ['경기도',['수원시 영통구','성남시 분당구','고양시 일산동구','용인시 기흥구','부천시','안양시 동안구','화성시','남양주시','평택시','안산시 단원구']],
  ['강원특별자치도',['춘천시','원주시','강릉시','속초시']],
  ['충청북도',['청주시 흥덕구','충주시','제천시']],
  ['충청남도',['천안시 서북구','아산시','서산시']],
  ['전북특별자치도',['전주시 완산구','익산시','군산시']],
  ['전라남도',['여수시','순천시','목포시']],
  ['경상북도',['포항시 남구','구미시','경주시','안동시']],
  ['경상남도',['창원시 성산구','김해시','진주시','양산시']],
  ['제주특별자치도',['제주시','서귀포시']]
];
const ROAD=['테헤란로','세종대로','올림픽로','중앙로','한강대로','왕십리로','반포대로','도산대로','양재대로','학동로','백제고분로','공항대로','신촌로','충무로','가로수길','디지털로','판교역로','정자일로','벚꽃로','상록로','산업로','호수로','문화로','시청로','대학로'];
const DOM=['naver.com','gmail.com','daum.net','hanmail.net','kakao.com','nate.com','outlook.com','company.co.kr'];
const A36='abcdefghijklmnopqrstuvwxyz0123456789';

function genName(o){
  const L=Math.max(2,Math.min(5,String(o).replace(/\s/g,'').length));
  const s1=pick(SUR.filter(x=>x.length===1));
  if(L===2) return s1+pick(GIVEN1);
  if(L===3) return s1+pick(GIVEN2);
  if(L===4) return Math.random()<.5 ? pick(SUR2)+pick(GIVEN2) : s1+pick(GIVEN2)+pick(GIVEN1);
  return pick(SUR2)+pick(GIVEN2)+pick(GIVEN1);
}
function genDigitsLike(o){ return String(o).replace(/\d/g,()=>String(rnd(10))); }
function genPhone(o){
  const s=String(o), m=s.match(/^(\d{2,4})([-. ]?)(\d{3,4})([-. ]?)(\d{4})$/);
  if(!m) return genDigitsLike(s);
  return m[1]+m[2]+pad(rnd(10000),m[3].length)+m[4]+pad(rnd(10000),4);
}
function genEmail(o){
  const s=String(o), at=s.lastIndexOf('@');
  let loc=''; const n=Math.max(5,Math.min(11, at>0?at:7));
  for(let i=0;i<n;i++) loc+=A36[rnd(36)];
  return loc+'@'+(at>0?s.slice(at+1):pick(DOM));
}
function genRrn(o){
  const s=String(o), sep=s.includes('-')?'-':(s.includes(' ')?' ':'');
  const y=pad(rnd(100),2), mo=pad(1+rnd(12),2), d=pad(1+rnd(28),2);
  return y+mo+d+sep+String(1+rnd(4))+pad(rnd(1000000),6);
}
function genAddress(){
  const a=pick(AREA), gu=pick(a[1]);
  let s=a[0]+(gu?' '+gu:'')+' '+pick(ROAD)+' '+(1+rnd(320));
  if(Math.random()<.45) s+='-'+(1+rnd(30));
  if(Math.random()<.4) s+=' '+(101+rnd(12))+'동 '+(101+rnd(1800))+'호';
  return s;
}
function genNumber(o){
  const s=String(o), neg=/^-/.test(s), parts=s.replace(/[-,]/g,'').split('.');
  let ip=parts[0].replace(/\d/g,()=>String(rnd(10))).replace(/^0(?=\d)/,String(1+rnd(9)));
  let r=(neg?'-':'')+ip+(parts[1]!=null?'.'+parts[1].replace(/\d/g,()=>String(rnd(10))):'');
  if(s.includes(',')){ const p=r.split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,','); r=p.join('.'); }
  return r;
}
function genDate(o){
  const s=String(o), m=s.match(/^(\d{4})([-./])(\d{1,2})\2(\d{1,2})(.*)$/);
  if(!m) return genDigitsLike(s);
  return m[1]+m[2]+pad(1+rnd(12),m[3].length)+m[2]+pad(1+rnd(28),m[4].length)+m[5];
}
/* 글자 종류 유지 치환 — 숫자→숫자, 영대→영대, 영소→영소, 한글→한글, 나머지 그대로 */
function genShape(o){
  return String(o).replace(/[\s\S]/g,ch=>{
    if(ch>='0'&&ch<='9') return String(rnd(10));
    if(ch>='A'&&ch<='Z') return String.fromCharCode(65+rnd(26));
    if(ch>='a'&&ch<='z') return String.fromCharCode(97+rnd(26));
    if(ch>='가'&&ch<='힣') return pick(SYL);
    return ch;
  });
}
const GEN={
  name:genName, phone:genPhone, email:genEmail, rrn:genRrn,
  card:genDigitsLike, account:genDigitsLike, address:genAddress,
  id:genShape, number:genNumber, date:genDate, text:genShape
};

/* ══════════ 비식별형 생성기 ══════════
   형태유지 결과는 겉보기에 여전히 전화번호·주민번호 "모양"이라,
   개인정보 형식을 검사하는 시스템(DLP, 업로드 검증 등)은 가짜인지 알 수 없어 그대로 막음.
   비식별형은 숫자와 @ 를 아예 쓰지 않아서 어떤 개인정보 형식과도 겹치지 않음.
   즉 결과값이 개인정보가 아님을 형식만으로 증명할 수 있게 만드는 모드임. */
const L26='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function genSafeBody(){ let s=''; for(let i=0;i<6;i++) s+=L26[rnd(26)]; return s; }
function safePrefix(p,type){
  /* 접두어에 숫자가 섞이면 형식 검사에 걸릴 수 있어 문자만 남김 */
  const c=String(p||'').replace(/[^A-Za-z가-힣_]/g,'');
  return c||TYPES[type].prefix;
}

/* ══════════ 개인정보 형식 점검 ══════════
   결과 파일에 아직 개인정보 "형식"의 값이 남아 있는지 찾아냄.
   고르는 걸 깜빡한 열을 잡아주는 용도이기도 함 */
const ISO_DATE=/^\s*\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
const digitCount=s=>s.replace(/\D/g,'').length;
const PII=[
  ['전화번호',      /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/],
  ['주민등록번호',  /\d{6}[-.\s]?[1-4]\d{6}/],
  ['카드번호',      /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/],
  /* 날짜(2021-01-10)가 계좌번호 형식과 겹쳐서, 날짜꼴이 아니고 숫자가 10개 이상일 때만 잡음 */
  ['계좌번호',      /\d{2,6}-\d{2,6}-\d{2,8}/, s=>!ISO_DATE.test(s) && digitCount(s)>=10],
  ['이메일',        /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/]
];
/* 셀마다 정규식 5개를 돌리면 수십만 셀에서 느려지므로,
   한 번의 문자 스캔으로 "애초에 가능성이 없는 값"을 먼저 걸러냄.
   번호 형식은 모두 연속 숫자 4자리 이상이거나, 하이픈 + 전체 숫자 10자리 이상임 */
function piiCalc(s){
  if(s.indexOf('@')<0){
    let run=0,best=0,tot=0,hy=false;
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      if(c>=48&&c<=57){ tot++; if(++run>best) best=run; }
      else { run=0; if(c===45) hy=true; }
    }
    if(best<4 && !(hy&&tot>=10)) return -1;
  }
  for(let i=0;i<PII.length;i++){
    const e=PII[i];
    if(e[1].test(s) && (!e[2]||e[2](s))) return i;
  }
  return -1;
}
/* 같은 값이 반복되는 열(날짜·코드 등)에서 재계산을 피함 */
let piiCache=new Map();
function piiCacheReset(){ piiCache=new Map(); }
function piiHit(s){
  if(s.length<6) return -1;
  const c=piiCache.get(s);
  if(c!==undefined) return c;
  const r=piiCalc(s);
  if(piiCache.size<60000) piiCache.set(s,r);
  return r;
}

/* ══════════ 파일 읽기 ══════════ */
function decodeText(buf){
  const b=new Uint8Array(buf);
  if(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
  const u=new TextDecoder('utf-8').decode(b);
  if(u.indexOf('�')>=0){ try{ return new TextDecoder('euc-kr').decode(b); }catch(e){} }
  return u;
}
const isCsvName = n => /\.(csv|txt)$/i.test(n);
function readWorkbook(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('파일을 읽지 못함'));
    fr.onload=e=>{
      try{
        /* dense 모드가 큰 시트에서 눈에 띄게 빠름 (읽기·쓰기 왕복 확인됨)
           CSV는 반드시 raw:true — 안 그러면 자바스크립트 날짜 파서가
           "…올림픽로 58-6" 같은 주소를 1958-06-01로, 사번 "007"을 7로 망가뜨림.
           xlsx는 날짜가 형식으로 구분되므로 cellDates로 정상 변환됨 */
        if(isCsvName(file.name)){
          /* CSV는 라이브러리를 거치지 않고 직접 읽음 (3배 빠르고 값 훼손 위험도 없음) */
          const {rows,w}=csvToAoa(decodeText(e.target.result));
          res({wb:{SheetNames:['Sheet1'],Sheets:{Sheet1:{__aoa:rows,__w:w}}}, raw:null});
        }else{
          const buf=e.target.result;
          res({wb:XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true,dense:true}), raw:{buf}});
        }
      }catch(err){ rej(err); }
    };
    fr.readAsArrayBuffer(file);
  });
}
function fmtDate(d){
  return d.getFullYear()+'-'+pad(d.getMonth()+1,2)+'-'+pad(d.getDate(),2);
}
function sheetToGrid(ws){
  if(ws && ws.__aoa){              /* 직접 읽은 CSV — 모든 값이 이미 문자열임 */
    const rows=ws.__aoa, w=ws.__w;
    for(let r=0;r<rows.length;r++){
      const row=rows[r];
      for(let i=row.length;i<w;i++) row[i]='';
    }
    return rows;
  }
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:true});
  let w=0; aoa.forEach(r=>{ if(r.length>w) w=r.length; });
  return aoa.map(r=>{
    const out=new Array(w);
    for(let i=0;i<w;i++){ const v=r[i]; out[i]= v instanceof Date ? fmtDate(v) : (v==null?'':v); }
    return out;
  });
}
const colLetter = i => { let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=(i-m-1)/26; } return s; };
