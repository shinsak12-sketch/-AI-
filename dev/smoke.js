// 전체 흐름 자동 테스트 (모바일 뷰포트). dev 서버를 띄운 뒤 Playwright로 관문 → 등록 → 카드 → 게시판 → 관리자 순서로 진행.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');

const PORT = 3999;
const srv = spawn(process.execPath, ['dev/server.js'], { env: { ...process.env, PORT, DEV_MEM: '1', ADMIN_PASS: '1234' }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 800));
const shots = process.env.SHOTS || '';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|409|401/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
const shot = n => shots ? pg.screenshot({ path: `${shots}/${n}.png`, fullPage: false }) : null;
const url = `http://localhost:${PORT}/`;
try {
  await pg.goto(url); await pg.waitForTimeout(400); await shot('m1-gate');
  await pg.click('#key'); await pg.waitForTimeout(500); await shot('m2-test');
  await pg.fill('#cmd', 'VIBE'); await pg.click('#cmdgo'); await pg.waitForTimeout(1500);
  if (!(await pg.$('#k-enter'))) throw new Error('enter key missing');
  await shot('m3-pass');
  await pg.click('#k-enter'); await pg.waitForTimeout(300); await shot('m4-reg');
  await pg.fill('#f-name', '홍길동'); await pg.fill('#f-nick', '북극성'); await pg.fill('#f-pw', 'pass1234'); await pg.click('#qnext'); await pg.waitForTimeout(1800);
  console.log('card:', await pg.textContent('#c-no'), await pg.textContent('#c-name')); await shot('m5-card');
  await pg.click('#c-enter'); await pg.waitForTimeout(800); await shot('m6-room');
  console.log('room visible:', await pg.isVisible('#hub'), '| notice msgs:', (await pg.$$('#chat .msg.notice')).length);
  await pg.fill('#chatin', '퇴근길에 한 마디'); await pg.click('#chatgo'); await pg.waitForTimeout(400);
  console.log('my msg:', (await pg.$$('#chat .msg.me')).length);
  await pg.click('#b-plus'); await pg.fill('#w-title', '점심 룰렛'); await pg.fill('#w-html', '<!doctype html><html><body style="background:#000;color:#5CFF8A;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0"><h1 id="t">LUNCH</h1><script>document.getElementById("t").textContent="LUNCH ROULETTE"</script></body></html>');
  await pg.click('#w-go'); await pg.waitForTimeout(1200);
  console.log('stage iframe:', !!(await pg.$('#stageview iframe')), '| title:', (await pg.textContent('#s-title')).trim(), '| work msgs:', (await pg.$$('#chat .msg.work')).length, '| works count:', await pg.textContent('#n-works'));
  const frame = pg.frames().find(f => f.parentFrame());
  console.log('iframe ran script:', frame ? await frame.evaluate(() => document.getElementById('t').textContent) : 'no frame');
  await shot('m7-stage');
  await pg.click('#b-crew'); await pg.waitForTimeout(400); console.log('crew tiles:', (await pg.$$('#crewlist .crewtile')).length); await shot('m8-crew'); await pg.click('#sheet-crew [data-close]');
  await pg.click('#b-works'); await pg.waitForTimeout(400); console.log('works items:', (await pg.$$('#works-list .witem')).length); await pg.click('#sheet-works [data-close]');
  // 재입장 + 닉네임 충돌
  await pg.goto(url); await pg.waitForTimeout(300);
  const dup = await pg.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '김철수', nick: '북극성', password: 'abcd' }) }).then(r => r.status));
  console.log('dup nick status (expect 409):', dup);
  const bad = await pg.evaluate(() => fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '북극성', password: 'wrong' }) }).then(r => r.status));
  console.log('bad login status (expect 401):', bad);
  await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
  await pg.click('#quick'); await pg.waitForTimeout(200); await shot('m10-login');
  await pg.fill('#l-id', '홍길동'); await pg.fill('#l-pw', 'pass1234'); await pg.click('#l-go'); await pg.waitForTimeout(600);
  console.log('login by name → room visible:', await pg.isVisible('#hub'), '| me:', await pg.textContent('#hub-me'));
  const adm = await pg.evaluate(() => fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '관리자', password: '1234' }) }).then(r => r.status));
  console.log('admin crew login (expect 200):', adm, '| public crew count (expect 1):', await pg.evaluate(() => fetch('/api/crew').then(r => r.json()).then(j => j.crew.length)));
  // 관리자
  await pg.goto(url + '#admin'); await pg.waitForTimeout(900); await pg.fill('#apass', '1234'); await pg.press('#apass', 'Enter'); await pg.waitForTimeout(500);
  console.log('admin rows:', (await pg.$$('#atable tr')).length - 1); await shot('m9-admin');
  await pg.click('#a-close'); await pg.waitForTimeout(400); console.log('closed label:', await pg.textContent('#a-close'));
  await pg.click('#a-hub'); await pg.waitForTimeout(800);
  await pg.fill('#chatin', '이번 주 임무: 귀찮은 거 하나 적기'); await pg.click('#chatgo'); await pg.waitForTimeout(400);
  console.log('notice count after admin post:', (await pg.$$('#chat .msg.notice')).length); await shot('m11-admin-room');
  console.log('errors:', errs.length ? errs : 'none');
  if (errs.length) process.exitCode = 1;
} catch (e) { console.error('SMOKE FAIL', e.message); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
