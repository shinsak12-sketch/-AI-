// 전체 흐름 자동 테스트 (모바일 뷰포트). dev 서버를 띄운 뒤 Playwright로 관문 → 등록 → 카드 → 게시판 → 관리자 순서로 진행.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');

const PORT = 3999;
const srv = spawn(process.execPath, ['dev/server.js'], { env: { ...process.env, PORT, DEV_MEM: '1', ADMIN_PASS: '7919' }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 800));
const shots = process.env.SHOTS || '';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|409/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
const shot = n => shots ? pg.screenshot({ path: `${shots}/${n}.png`, fullPage: false }) : null;
const url = `http://localhost:${PORT}/`;
try {
  await pg.goto(url); await pg.waitForTimeout(400); await shot('m1-gate');
  await pg.click('#key'); await pg.waitForTimeout(500); await shot('m2-test');
  await pg.fill('#cmd', 'VIBE'); await pg.click('#cmdgo'); await pg.waitForTimeout(1500);
  if (!(await pg.$('#k-enter'))) throw new Error('enter key missing');
  await shot('m3-pass');
  await pg.click('#k-enter'); await pg.waitForTimeout(300); await shot('m4-reg');
  await pg.fill('#f-name', '홍길동'); await pg.fill('#f-nick', '북극성'); await pg.click('#qnext'); await pg.waitForTimeout(1800);
  console.log('card:', await pg.textContent('#c-no'), await pg.textContent('#c-name')); await shot('m5-card');
  await pg.click('#c-enter'); await pg.waitForTimeout(600); await shot('m6-hub');
  await pg.click('#tabs [data-tab="free"]'); await pg.waitForTimeout(400);
  await pg.click('.board[data-board="free"] [data-w]'); await pg.fill('.wform [data-f="title"]', '첫 글'); await pg.fill('.wform [data-f="body"]', '닉네임으로 올라가는지 확인'); await pg.click('.wform [data-post]'); await pg.waitForTimeout(500);
  await pg.click('.board[data-board="free"] .post-h >> nth=0'); await pg.waitForTimeout(200); await shot('m7-board');
  console.log('post author:', await pg.textContent('.board[data-board="free"] .post >> nth=0 >> .pa b'));
  await pg.click('#tabs [data-tab="notice"]'); await pg.waitForTimeout(400); console.log('notice write hidden for crew:', !(await pg.$('.board[data-board="notice"] [data-w]')));
  await pg.click('#tabs [data-tab="crew"]'); await pg.waitForTimeout(400); await shot('m8-crew');
  // 재입장 + 닉네임 충돌
  await pg.goto(url); await pg.waitForTimeout(300); console.log('quick visible:', await pg.isVisible('#quick'));
  const dup = await pg.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '김철수', nick: '북극성' }) }).then(r => r.status));
  console.log('dup nick status (expect 409):', dup);
  const relogin = await pg.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '홍길동', nick: '북극성' }) }).then(r => r.json()));
  console.log('relogin existing (expect true):', relogin.existing);
  // 관리자
  await pg.goto(url + '#admin'); await pg.waitForTimeout(900); await pg.fill('#apass', '7919'); await pg.press('#apass', 'Enter'); await pg.waitForTimeout(500);
  console.log('admin rows:', (await pg.$$('#atable tr')).length - 1); await shot('m9-admin');
  await pg.click('#a-close'); await pg.waitForTimeout(400); console.log('closed label:', await pg.textContent('#a-close'));
  await pg.click('#a-hub'); await pg.waitForTimeout(400); await pg.click('#tabs [data-tab="notice"]'); await pg.waitForTimeout(400);
  console.log('notice write visible for admin:', !!(await pg.$('.board[data-board="notice"] [data-w]')));
  await pg.click('.board[data-board="notice"] [data-w]'); await pg.fill('.wform [data-f="title"]', '1회차 일정'); await pg.fill('.wform [data-f="body"]', '다음 주 목요일 18시, 본점 3층.'); await pg.click('.wform [data-post]'); await pg.waitForTimeout(500);
  console.log('notice count:', (await pg.$$('.board[data-board="notice"] .post')).length);
  console.log('errors:', errs.length ? errs : 'none');
  if (errs.length) process.exitCode = 1;
} catch (e) { console.error('SMOKE FAIL', e.message); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
