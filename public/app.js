/* 본점 AI 학습회 · 프론트 로직. 데이터는 /api/* (Vercel 서버리스 + Neon). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const show = (id, on = true) => { $(id).hidden = !on; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmt = iso => { const d = new Date(iso); return String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
  const fmtFull = iso => { const d = new Date(iso); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
  const pad3 = n => n ? String(n).padStart(3, '0') : '---';

  /* ---------- API ---------- */
  const api = {
    async req(path, opts = {}) {
      const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      let data = {}; try { data = await r.json(); } catch {}
      if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { code: (data.error || 'http_' + r.status) + (data.message ? ': ' + String(data.message).slice(0, 120) : ''), status: r.status });
      return data;
    },
    get(p, h) { return this.req(p, { headers: h }); },
    post(p, body, h) { return this.req(p, { method: 'POST', body: JSON.stringify(body), headers: h }); },
  };
  const local = {
    read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let me = local.read('hq-me');           // {id, seq, nick, waitlist, created_at, token}
  let adminPass = sessionStorage.getItem('hq-admin') || '';
  const authH = () => me && me.token ? { 'x-crew-token': me.token } : {};
  const adminH = () => adminPass ? { 'x-admin-pass': adminPass } : {};

  /* ---------- 분위기 ---------- */
  const clock = $('clock');
  const tick = () => { const d = new Date(); clock.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); };
  tick(); setInterval(tick, 1000);
  addEventListener('pointermove', e => { document.documentElement.style.setProperty('--mx', e.clientX + 'px'); document.documentElement.style.setProperty('--my', e.clientY + 'px'); }, { passive: true });

  const cv = $('rain'), cx = cv.getContext('2d');
  const glyphs = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅓㅗㅜㅡㅣ0123456789ABCDEF<>/{}=;$#@'.split('');
  let cols = [], fs = 14;
  function size() { const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Array.from({ length: Math.ceil(innerWidth / fs) }, () => ({ y: -Math.random() * innerHeight / fs, v: .3 + Math.random() * .8 })); }
  size(); addEventListener('resize', size);
  let last = 0;
  function frame(t) {
    if (t - last > 70) { last = t; cx.fillStyle = 'rgba(5,5,7,.18)'; cx.fillRect(0, 0, innerWidth, innerHeight); cx.font = fs + 'px "Share Tech Mono", monospace';
      cols.forEach((c, i) => { cx.fillStyle = Math.random() < .03 ? '#E5323C' : '#2E7A47'; cx.fillText(glyphs[Math.random() * glyphs.length | 0], i * fs, c.y * fs); c.y += c.v; if (c.y * fs > innerHeight && Math.random() > .975) c.y = 0; }); }
    requestAnimationFrame(frame);
  }
  if (!reduce) requestAnimationFrame(frame);

  const pool = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ0123456789#$%&@*!?';
  function decrypt(el, ms) {
    const target = el.textContent; if (reduce) return Promise.resolve();
    const start = performance.now();
    return new Promise(res => { (function step() { const p = Math.min(1, (performance.now() - start) / ms); const n = Math.floor(target.length * p);
      el.textContent = target.slice(0, n) + [...target.slice(n)].map(c => c === ' ' ? ' ' : pool[Math.random() * pool.length | 0]).join('');
      if (p < 1) requestAnimationFrame(step); else { el.textContent = target; res(); } })(); });
  }

  /* ---------- 터미널 ---------- */
  function typer(box) {
    const lines = box.querySelector('.lines');
    return async (t, cls = '') => { const e = document.createElement('span'); e.className = 'l ' + cls; lines.appendChild(e); for (const ch of t) { e.textContent += ch; await wait(14); } return e; };
  }

  /* ---------- 관문 ---------- */
  const term = $('term'), lines = $('lines'), key = $('key'), keytxt = $('keytxt'), form = $('form'), cmd = $('cmd');
  const T = typer(term);
  const KEY = String.fromCharCode(86, 73, 66, 69).toLowerCase();
  const isKey = v => { const n = v.replace(/[\s「」'"“”‘’.]/g, '').toLowerCase(); return n.includes(KEY) || /바이브|바이비/.test(n); };
  let busy = false, granted = false, tries = 0, stares = 0, phase = 'ask';

  (async () => {
    await decrypt($('l1'), 1200); await decrypt($('l2'), 900);
    $('h1').classList.add('jitter'); await wait(700); $('h1').classList.remove('jitter');
  })();
  (async () => { await wait(1100); for (const p of document.querySelectorAll('#letter p')) { p.classList.add('on'); await wait(360); } })();

  async function grant() {
    granted = true; key.classList.add('granted'); keytxt.textContent = '입장하기';
    await T('> 본점 소속 확인 ............ OK', 'ok');
    await T('> 코딩 능력 검사 ............ 생략 (필요 없음)', 'ok');
    const d = await T('> 명부 등록 중 '); for (let i = 0; i < 8; i++) { d.textContent += '█'; await wait(80); }
    await T('> 통과. AI에게 물을 줄 아는 사람이다.', 'ok');
    await T('> 우리에게 이르는 길이 열렸다. 입장하라.', 'hi');
    addEnterKey();
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const v = cmd.value.trim(); if (!v) return; cmd.value = ''; busy = true;
    const l = document.createElement('span'); l.className = 'l hi'; l.textContent = '> ' + v; lines.appendChild(l);
    if (granted) { await T('> 이미 통과했다. 입장하라.'); busy = false; return; }
    const n = v.replace(/\s/g, '').toLowerCase();
    if (isKey(v)) { await T('> 열쇠 일치.', 'ok'); await grant(); }
    else if (/^(힌트|hint|도움|help|\?)$/.test(n)) {
      const hints = ['> 프롬프트를 통째로 복사해서 AI에게 던져라. 영어는 몰라도 된다.', '> AI가 파일을 안 주고 코드만 보여주면 "파일로 만들어줘" 라고 한 번 더 말해라.', '> 파일 저장이 어려우면 Claude 에 넣어라. 결과를 바로 보여준다.', '> 열쇠는 영어 네 글자. 파일을 열면 붉게 뜬다.'];
      await T(hints[Math.min(tries, hints.length - 1)]);
    } else {
      tries++;
      const no = ['> 아니다.', '> 틀렸다. 다시.', '> 파일은 열어봤는가.', '> 조급해하지 마라. 시험은 도망가지 않는다.', '> 막히면 "힌트" 라고 쳐도 된다.'];
      await T(no[Math.min(tries - 1, no.length - 1)], 'warn');
    }
    busy = false;
  });
  document.querySelector('.emblem').addEventListener('click', async () => { stares++; if (busy || stares !== 3 || phase !== 'test') return; busy = true; await T('> 응시를 감지했다. 눈으로 푸는 시험이 아니다. AI에게 시켜라.', 'hi'); busy = false; });

  key.addEventListener('click', async () => {
    if (busy) return; busy = true;
    key.classList.add('down'); await wait(120); key.classList.remove('down');
    if (phase === 'ask') {
      phase = 'test'; $('decline').remove(); keytxt.textContent = '잠김 · 열쇠 필요';
      show('cipher'); await wait(400); show('term'); lines.innerHTML = '';
      await T('> 응시 확인. 시험을 시작한다.', 'ok');
      await T('> 첫 번째 임무: 위 프롬프트로 AI에게 파일 하나를 만들게 하라.');
      await T('> 그 파일을 열면 열쇠가 나온다. 여기에 입력하라. 막히면 "힌트".', 'hi');
      $('cipher').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    } else if (!granted) {
      if (cmd.value.trim()) { busy = false; form.requestSubmit(); return; }
      await T('> 잠겨 있다. 열쇠를 먼저 찾아라. 아래 입력란에 넣고 "입력"을 눌러라.', 'warn');
    } else { busy = false; goRegister(); return; }
    busy = false;
  });
  $('decline').addEventListener('click', async () => {
    if (busy) return; busy = true; show('term'); form.hidden = true;
    await T('> 선택은 존중한다.'); await T('> 다만 이 페이지는 당신을 기억할 것이다.', 'warn'); await wait(800); await T('> 마음이 바뀌면, 위의 키를 누르면 된다.', 'hi');
    busy = false;
  });
  $('copyprompt').addEventListener('click', async () => {
    const note = (t, c) => { $('cnote').textContent = t; $('cnote').className = 'note mono ' + c; };
    try { await navigator.clipboard.writeText($('promptq').textContent); note('복사됨. AI 대화창에 붙여넣고 보내라.', 'ok'); }
    catch { note('복사가 막혀 있다. 프롬프트 상자를 한 번 누르면 전체가 선택된다.', 'warn'); }
  });
  function addEnterKey() {
    if ($('k-enter')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'key enter'; b.id = 'k-enter';
    b.innerHTML = '<span class="cap"><span class="led on"></span><span class="mono">입장하기</span><span class="enter mono">ENTER</span></span>';
    term.insertAdjacentElement('afterend', b);
    b.addEventListener('click', async () => { b.classList.add('down'); await wait(120); goRegister(); });
    b.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------- 등록 ---------- */
  function goRegister() { show('gate', false); show('reg'); scrollTo(0, 0); setTimeout(() => $('f-name').focus(), 80); }
  async function register() {
    const name = $('f-name').value.trim(), nick = $('f-nick').value.trim(), pw = $('f-pw').value, err = $('qerr');
    if (!name) { err.textContent = '이름이 비어 있다.'; $('f-name').focus(); return; }
    if (!nick) { err.textContent = '닉네임이 비어 있다.'; $('f-nick').focus(); return; }
    if (pw.length < 4) { err.textContent = '비밀번호는 4자 이상.'; $('f-pw').focus(); return; }
    $('qnext').disabled = true; err.textContent = '';
    let res;
    try { res = await api.post('/api/register', { name, nick, password: pw }); }
    catch (e) {
      $('qnext').disabled = false;
      err.textContent = e.code === 'nick_taken' ? '이미 쓰는 닉네임이다. 본인 것이면 첫 화면의 "이미 크루 · 입장"으로.' : e.code === 'password_short' ? '비밀번호는 4자 이상.' : '등록 실패. 잠시 후 다시. (' + e.code + ')';
      return;
    }
    me = { ...res.crew, token: res.token }; local.write('hq-me', me);
    show('reg', false); show('cardscr'); scrollTo(0, 0);
    const C = typer($('cterm'));
    await C('> 명부에 기록 중 ...');
    await C('> 기록 완료.', 'ok');
    if (me.waitlist) await C('> 명부가 마감되어 대기 명단에 올렸다.', 'warn');
    await C('> 크루 카드를 발급한다.', 'hi');
    await wait(300); renderCard(); show('card'); await wait(700); show('card-actions');
  }
  function renderCard() {
    $('c-no').textContent = 'CREW #' + pad3(me.seq); $('c-name').textContent = me.nick; $('c-date').textContent = fmtFull(me.created_at); $('c-status').textContent = me.waitlist ? 'WAITLIST' : 'CREW';
  }
  $('qnext').addEventListener('click', register);
  $('f-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('f-nick').focus(); } });
  $('f-nick').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('f-pw').focus(); } });
  $('f-pw').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); register(); } });
  $('c-enter').addEventListener('click', enterHub);
  $('c-save').addEventListener('click', async () => {
    const note = (t, c = '') => { $('c-note').textContent = t; $('c-note').className = 'note mono ' + c; };
    try {
      const blob = await drawCard(me); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'crew-' + pad3(me.seq) + '.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); note('저장됨. 어디에 올려도 좋다. 실명은 없다.', 'ok');
    } catch { note('저장이 막혀 있다. 카드를 캡처하라.', 'warn'); }
  });
  function drawCard(r) {
    const W = 1200, H = 700, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0F1117'); g.addColorStop(1, '#07080B'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#2A2D38'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3);
    x.fillStyle = 'rgba(255,255,255,.035)'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
    x.font = '22px "Share Tech Mono", monospace'; x.fillStyle = '#8A8D97'; x.fillText('본점 AI 학습회 · 1기', 48, 66);
    x.fillStyle = '#E5323C'; x.textAlign = 'right'; x.fillText(r.waitlist ? 'WAITLIST' : 'CREW', W - 48, 66); x.textAlign = 'left';
    const cxp = 190, cyp = 350; x.setLineDash([6, 12]); x.strokeStyle = 'rgba(233,231,225,.35)'; x.lineWidth = 3; x.beginPath(); x.arc(cxp, cyp, 120, 0, Math.PI * 2); x.stroke();
    x.setLineDash([4, 26]); x.strokeStyle = '#E5323C'; x.lineWidth = 4; x.beginPath(); x.arc(cxp, cyp, 74, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#E9E7E1'; x.beginPath(); x.moveTo(cxp - 52, cyp); x.quadraticCurveTo(cxp, cyp - 46, cxp + 52, cyp); x.quadraticCurveTo(cxp, cyp + 46, cxp - 52, cyp); x.fill();
    x.fillStyle = '#050507'; x.beginPath(); x.arc(cxp, cyp, 14, 0, Math.PI * 2); x.fill(); x.fillStyle = '#E5323C'; x.beginPath(); x.arc(cxp, cyp, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#E5323C'; x.font = '28px "Share Tech Mono", monospace'; x.fillText('CREW #' + pad3(r.seq), 380, 290);
    x.fillStyle = '#E9E7E1'; x.font = 'bold 96px "Black Han Sans", "Noto Sans KR", sans-serif'; x.fillText(r.nick, 376, 400);
    x.fillStyle = '#8A8D97'; x.font = '26px "Share Tech Mono", monospace'; x.fillText('본점 AI 학습회', 380, 460);
    x.font = '22px "Share Tech Mono", monospace'; x.fillStyle = '#8A8D97'; x.fillText(fmtFull(r.created_at), 48, H - 48); x.fillStyle = '#E5323C'; x.textAlign = 'right'; x.fillText('7919', W - 48, H - 48);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  /* ---------- 방: 출력 화면 + 채팅 ---------- */
  const chatEl = $('chat'), chatin = $('chatin');
  let works = [], stageIdx = -1, lastId = 0, pollTimer = null, htmlCache = {};
  const timeOf = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  function enterHub() {
    ['gate', 'reg', 'cardscr', 'admin', 'login'].forEach(id => show(id, false)); show('hub'); document.body.classList.add('room'); scrollTo(0, 0);
    $('hub-me').innerHTML = me ? `1기 · <i>@${esc(me.nick)}</i>${me.seq ? ' · #' + pad3(me.seq) : ' · ADMIN'}` : (adminPass ? '1기 · <i>담당자</i>' : '1기 · 내부망');
    chatin.placeholder = adminPass && !me ? '공지로 올라간다' : '할 말';
    if (!me && !adminPass) { $('b-plus').disabled = true; }
    loadWorks(true); poll(); startPoll(); refreshCrewCount();
  }
  async function refreshCrewCount() { try { $('n-crew').textContent = (await api.get('/api/crew')).crew.length; } catch {} }

  /* 출력 화면 */
  async function loadWorks(showLatest) {
    try { works = (await api.get('/api/works')).works; } catch { return; }
    $('n-works').textContent = works.length;
    if (works.length && (showLatest || stageIdx < 0)) showWork(0);
    if (!works.length) { stageIdx = -1; $('stageview').innerHTML = '<div class="stage-empty mono">아직 올라온 작품이 없다.<br>첫 작품을 올려라. 아래 <b>+</b></div>'; $('s-title').textContent = 'OUTPUT · 대기 중'; show('s-open', false); }
  }
  async function showWork(i) {
    if (!works.length) return; stageIdx = (i + works.length) % works.length;
    const w = works[stageIdx], view = $('stageview');
    $('s-title').innerHTML = `<b>#${works.length - stageIdx}</b> ${esc(w.title)} <i>@${esc(w.author)}</i>`;
    if (w.link) { $('s-open').href = w.link; show('s-open'); } else show('s-open', false);
    if (w.has_html) {
      view.innerHTML = '<div class="stage-empty mono">불러오는 중 ...</div>';
      try {
        if (!htmlCache[w.id]) htmlCache[w.id] = (await api.get('/api/works?id=' + w.id)).work.html;
        if (works[stageIdx] !== w) return;
        const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups'); f.title = w.title; f.srcdoc = htmlCache[w.id]; view.innerHTML = ''; view.appendChild(f);
      } catch { view.innerHTML = '<div class="stage-empty mono">불러오기 실패</div>'; }
    } else {
      view.innerHTML = `<div class="stage-link"><div class="lt">${esc(w.title)}</div><div class="mono">@${esc(w.author)} · 링크 작품</div><a class="act" href="${esc(w.link)}" target="_blank" rel="noopener">열기 ↗</a></div>`;
    }
  }
  $('s-prev').addEventListener('click', () => showWork(stageIdx - 1));
  $('s-next').addEventListener('click', () => showWork(stageIdx + 1));
  $('s-full').addEventListener('click', () => { $('stagebox').classList.remove('mini'); const on = $('stagebox').classList.toggle('full'); $('s-full').textContent = on ? '✕' : '⤢'; });
  const setMini = on => { $('stagebox').classList.toggle('mini', on); $('s-mini').textContent = on ? '▴' : '▾'; $('s-mini').setAttribute('aria-label', on ? '출력 화면 펼치기' : '출력 화면 접기'); local.write('hq-mini', on); };
  $('s-mini').addEventListener('click', () => setMini(!$('stagebox').classList.contains('mini')));
  if (local.read('hq-mini')) setMini(true);

  /* 채팅 */
  function addMsg(m, scroll) {
    const el = document.createElement('div');
    const mine = me && m.crew_id === me.id && m.kind === 'chat';
    if (m.kind === 'notice') { el.className = 'msg notice'; el.innerHTML = `<div class="meta"><b>담당자</b> ${timeOf(m.created_at)}</div><div class="bub">${esc(m.text)}</div>`; }
    else if (m.kind === 'work') { el.className = 'msg work'; el.innerHTML = `<div class="meta"><b>@${esc(m.author)}</b> 작품을 올렸다 · ${timeOf(m.created_at)}</div><div class="bub"><div class="wt"><small>WORK</small>${esc(m.text)}</div><button type="button" class="act small" data-work="${m.work_id}">화면에 띄우기</button></div>`; }
    else if (m.kind === 'sys') { el.className = 'msg sys'; el.innerHTML = `<div class="bub">${esc(m.text)}</div>`; }
    else { el.className = 'msg' + (mine ? ' me' : ''); el.innerHTML = `<div class="meta"><b>@${esc(m.author)}</b> ${timeOf(m.created_at)}</div><div class="bub">${esc(m.text)}</div>`; }
    chatEl.appendChild(el);
    const wb = el.querySelector('[data-work]'); if (wb) wb.addEventListener('click', () => { const i = works.findIndex(w => w.id === Number(wb.dataset.work)); if (i >= 0) { setMini(false); showWork(i); $('stagebox').scrollIntoView({ block: 'start' }); } else loadWorks(true); });
    if (scroll) chatEl.scrollTop = chatEl.scrollHeight;
  }
  async function poll() {
    if ($('hub').hidden) return;
    try {
      const r = await api.get('/api/chat?after=' + lastId);
      const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80;
      let newWork = false;
      for (const m of r.messages) { if (m.id > lastId) { lastId = m.id; addMsg(m, false); if (m.kind === 'work') newWork = true; } }
      if (r.messages.length && nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
      if (newWork) { setMini(false); loadWorks(true); }
      if (!chatEl.children.length) chatEl.innerHTML = '<div class="empty">아직 조용하다. 첫 마디를 던져라.</div>';
    } catch {}
  }
  function startPoll() { clearInterval(pollTimer); pollTimer = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, 3000); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('hub').hidden) poll(); });
  $('chatform').addEventListener('submit', async e => {
    e.preventDefault(); const text = chatin.value.trim(); if (!text) return;
    chatin.value = ''; $('chatgo').disabled = true;
    try { const r = await api.post('/api/chat', { text }, { ...authH(), ...adminH() }); if (r.message.id > lastId) { lastId = r.message.id; chatEl.querySelector('.empty')?.remove(); addMsg(r.message, true); } }
    catch (err) { chatin.value = text; addMsg({ kind: 'sys', text: err.code === 'not_crew' ? '명부에 없는 계정. 첫 화면에서 다시 입장하라.' : '전송 실패 · ' + err.code, created_at: new Date().toISOString() }, true); }
    $('chatgo').disabled = false; chatin.focus();
  });

  /* 시트 */
  const openSheet = id => { document.querySelectorAll('.sheet').forEach(x => x.hidden = true); show(id); };
  document.querySelectorAll('.sheet [data-close]').forEach(b => b.addEventListener('click', () => b.closest('.sheet').hidden = true));
  $('b-plus').addEventListener('click', () => { openSheet('sheet-work'); setTimeout(() => $('w-title').focus(), 60); });
  $('b-works').addEventListener('click', async () => {
    openSheet('sheet-works'); await loadWorks(false);
    $('works-list').innerHTML = works.length ? `<div class="wlist">${works.map((w, i) => `<button type="button" class="witem" data-i="${i}"><div class="wt"><b>${esc(w.title)}</b><small>@${esc(w.author)} · ${fmt(w.created_at)}</small></div><span class="tag">${w.has_html ? 'RUN' : 'LINK'}</span></button>`).join('')}</div>` : '<div class="empty">아직 없다.</div>';
    $('works-list').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { showWork(Number(b.dataset.i)); $('sheet-works').hidden = true; }));
  });
  $('b-crew').addEventListener('click', async () => {
    openSheet('sheet-crew'); $('crewlist').innerHTML = '<div class="empty">불러오는 중 ...</div>';
    try { const crew = (await api.get('/api/crew')).crew; $('n-crew').textContent = crew.length;
      $('crewlist').innerHTML = crew.length ? `<div class="crewgrid">${crew.map(c => `<div class="crewtile ${me && c.id === me.id ? 'me' : ''}"><div class="cn">CREW #${pad3(c.seq)}${c.waitlist ? ' · WAIT' : ''}</div><div class="ck">${esc(c.nick)}</div><div class="cd">${fmt(c.created_at)} 합류</div></div>`).join('')}</div>` : '<div class="empty">아직 아무도 없다.</div>';
    } catch (e) { $('crewlist').innerHTML = `<div class="empty">불러오기 실패 · ${esc(e.code)}</div>`; }
  });
  $('w-go').addEventListener('click', async () => {
    const title = $('w-title').value.trim(), html = $('w-html').value.trim(), link = $('w-link').value.trim(), err = $('w-err');
    if (!title) { err.textContent = '제목이 비어 있다.'; return; }
    if (!html && !link) { err.textContent = 'HTML 코드나 링크 중 하나는 있어야 한다.'; return; }
    if (link && !/^https?:\/\//i.test(link)) { err.textContent = '링크는 http(s):// 로 시작해야 한다.'; return; }
    if (html.length > 300000) { err.textContent = '코드가 너무 크다 (300KB 이하).'; return; }
    $('w-go').disabled = true; err.textContent = '';
    try { await api.post('/api/works', { title, html, link }, authH()); $('w-title').value = ''; $('w-html').value = ''; $('w-link').value = ''; $('sheet-work').hidden = true; await poll(); setMini(false); await loadWorks(true); $('stagebox').scrollIntoView({ block: 'start' }); }
    catch (e) { err.textContent = e.code === 'not_crew' ? '명부에 없는 계정. 첫 화면에서 다시 입장하라.' : '올리기 실패 · ' + e.code; }
    $('w-go').disabled = false;
  });

  /* ---------- 재입장 ---------- */
  function goLogin() {
    ['gate', 'reg', 'cardscr', 'hub', 'admin'].forEach(id => show(id, false)); show('login'); scrollTo(0, 0);
    if (me && me.token) { $('l-quick').textContent = me.nick + ' 으로 바로 입장'; show('l-quick'); } else show('l-quick', false);
    setTimeout(() => (me ? $('l-quick') : $('l-id')).focus(), 80);
  }
  async function login() {
    const id = $('l-id').value.trim(), pw = $('l-pw').value, err = $('lerr');
    if (!id) { err.textContent = '닉네임이나 이름을 넣어라.'; return; }
    if (!pw) { err.textContent = '비밀번호가 비어 있다.'; return; }
    $('l-go').disabled = true; err.textContent = '';
    try { const r = await api.post('/api/login', { id, password: pw }); me = { ...r.crew, token: r.token }; local.write('hq-me', me); enterHub(); }
    catch (e) { err.textContent = e.code === 'bad_login' ? '명부에 없거나 비밀번호가 다르다.' : '입장 실패 · ' + e.code; }
    $('l-go').disabled = false;
  }
  $('quick').addEventListener('click', goLogin);
  $('l-go').addEventListener('click', login);
  $('l-pw').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); login(); } });
  $('l-id').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('l-pw').focus(); } });
  $('l-quick').addEventListener('click', enterHub);
  $('l-back').addEventListener('click', () => { show('login', false); show('gate'); scrollTo(0, 0); });

  addEventListener('hashchange', () => location.reload());

  /* ---------- 담당자 ---------- */
  if (location.hash === '#admin') {
    show('gate', false); show('admin');
    let rows = [], closed = false;
    const note = (t, c = '') => { $('a-note').textContent = t; $('a-note').className = 'note mono ' + c; };
    async function loadAdmin() {
      try {
        const r = await api.get('/api/admin/crew', adminH()); rows = r.crew; closed = !!r.settings.closed;
        $('a-close').textContent = closed ? '명부 다시 열기' : '명부 마감';
        $('astats').innerHTML = `<span>총원<b>${rows.length}</b></span><span>대기<b>${rows.filter(x => x.waitlist).length}</b></span><span>상태<b>${closed ? '마감' : '모집중'}</b></span>`;
        $('atable').innerHTML = '<tr>' + ['#', '상태', '이름', '닉네임', '등록'].map(h => `<th>${h}</th>`).join('') + '</tr>' + rows.map(x => `<tr class="${x.waitlist ? 'wait' : ''}"><td>${x.seq}</td><td>${x.waitlist ? '대기' : '크루'}</td><td>${esc(x.name)}</td><td>${esc(x.nick)}</td><td>${String(x.created_at).slice(0, 16).replace('T', ' ')}</td></tr>`).join('');
        note(rows.length ? '' : '아직 아무도 없다.');
        return true;
      } catch (e) { if (e.status === 403) { sessionStorage.removeItem('hq-admin'); adminPass = ''; } note('불러오기 실패 · ' + e.code, 'warn'); return false; }
    }
    $('aform').addEventListener('submit', async e => {
      e.preventDefault(); adminPass = $('apass').value; sessionStorage.setItem('hq-admin', adminPass);
      if (await loadAdmin()) { $('aform').hidden = true; show('apanel'); } else { $('apass').value = ''; $('apass').placeholder = '틀렸다.'; }
    });
    if (adminPass) loadAdmin().then(ok => { if (ok) { $('aform').hidden = true; show('apanel'); } });
    $('a-reload').addEventListener('click', loadAdmin);
    $('a-hub').addEventListener('click', enterHub);
    $('a-close').addEventListener('click', async () => { try { await api.post('/api/admin/settings', { closed: !closed }, adminH()); loadAdmin(); } catch (e) { note('변경 실패 · ' + e.code, 'warn'); } });
    $('a-csv').addEventListener('click', () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const csv = '﻿' + ['seq', 'status', 'name', 'nick', 'created_at'].join(',') + '\n' + rows.map(x => [x.seq, x.waitlist ? 'waitlist' : 'crew', x.name, x.nick, x.created_at].map(q).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'crew-list.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }
})();
