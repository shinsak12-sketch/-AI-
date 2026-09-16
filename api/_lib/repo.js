// 데이터 계층. DEV_MEM=1 이면 메모리 저장소(로컬 개발), 아니면 Neon Postgres.
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const newToken = () => randomBytes(24).toString('hex');
const nickKey = s => String(s).trim().toLowerCase();
export const ADMIN_NICK = '관리자';
export const adminPass = () => process.env.ADMIN_PASS || '1234';
export function hashPass(pw) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(String(pw), salt, 32).toString('hex'); }
export function checkPass(pw, stored) { if (!stored) return false; const [salt, h] = String(stored).split(':'); if (!salt || !h) return false; const a = scryptSync(String(pw), salt, 32), b = Buffer.from(h, 'hex'); return a.length === b.length && timingSafeEqual(a, b); }

/* ---------- Neon 구현 ---------- */
let _sql = null, _ready = null;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 없음');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
// 스키마 준비. 여러 함수가 동시에 첫 호출되면 CREATE TABLE IF NOT EXISTS 가 서로 충돌할 수 있어 재시도하고, 실패 시 캐시를 비워 다음 호출에서 다시 시도함.
async function ensure() {
  if (!_ready) {
    _ready = (async () => {
      for (let i = 0; ; i++) {
        try { await migrate(); return; }
        catch (e) { if (i >= 3) throw e; await new Promise(r => setTimeout(r, 300 + Math.random() * 700)); }
      }
    })().catch(e => { _ready = null; throw e; });
  }
  return _ready;
}
async function migrate() {
  const s = sql();
  {
      await s`create table if not exists crew (
        id serial primary key,
        seq integer not null,
        name text not null,
        nick text not null,
        nick_key text not null unique,
        token text not null,
        waitlist boolean not null default false,
        created_at timestamptz not null default now()
      )`;
      await s`alter table crew add column if not exists pass_hash text not null default ''`;
      await s`create table if not exists posts (
        id serial primary key,
        board text not null,
        title text not null,
        body text not null default '',
        prompt text not null default '',
        link text not null default '',
        author text not null,
        crew_id integer,
        created_at timestamptz not null default now()
      )`;
      await s`create index if not exists posts_board_idx on posts (board, created_at desc)`;
      await s`create table if not exists works (
        id serial primary key,
        title text not null,
        link text not null default '',
        html text not null default '',
        author text not null,
        crew_id integer,
        created_at timestamptz not null default now()
      )`;
      await s`create table if not exists messages (
        id serial primary key,
        kind text not null default 'chat',
        author text not null,
        crew_id integer,
        text text not null default '',
        work_id integer,
        created_at timestamptz not null default now()
      )`;
      await s`create index if not exists messages_id_idx on messages (id)`;
      await s`create table if not exists settings (key text primary key, value jsonb not null)`;
      await s`insert into settings (key, value) values ('main', '{"closed": false}') on conflict (key) do nothing`;
      await s`insert into messages (kind, author, text)
        select 'notice', '담당자', '환영한다. 여기는 모이지 않는 학습회다. 만든 것은 위 화면에 올리고, 할 말은 여기서 한다.'
        where not exists (select 1 from messages)`;
      // 관리자 크루 계정 (seq 0). 없으면 만든다. 비밀번호는 ADMIN_PASS (기본 1234).
      await s`insert into crew (seq, name, nick, nick_key, token, waitlist, pass_hash)
        select 0, ${ADMIN_NICK}, ${ADMIN_NICK}, ${nickKey(ADMIN_NICK)}, ${newToken()}, false, ${hashPass(adminPass())}
        where not exists (select 1 from crew where nick_key = ${nickKey(ADMIN_NICK)})`;
  }
}
const pubCrew = r => ({ id: r.id, seq: r.seq, nick: r.nick, waitlist: r.waitlist, created_at: r.created_at });

const neonRepo = {
  async settings() { await ensure(); const [r] = await sql()`select value from settings where key = 'main'`; return r ? r.value : { closed: false }; },
  async setClosed(closed) { await ensure(); await sql()`insert into settings (key, value) values ('main', ${JSON.stringify({ closed: !!closed })}::jsonb) on conflict (key) do update set value = excluded.value`; return { closed: !!closed }; },
  async findByNick(nick) { await ensure(); const [r] = await sql()`select * from crew where nick_key = ${nickKey(nick)}`; return r || null; },
  async findByToken(t) { if (!t) return null; await ensure(); const [r] = await sql()`select * from crew where token = ${t}`; return r || null; },
  async createCrew({ name, nick, password, waitlist }) {
    await ensure();
    const tok = newToken();
    const [r] = await sql()`insert into crew (seq, name, nick, nick_key, token, waitlist, pass_hash)
      values ((select coalesce(max(seq), 0) + 1 from crew), ${name}, ${nick}, ${nickKey(nick)}, ${tok}, ${!!waitlist}, ${hashPass(password)}) returning *`;
    return r;
  },
  async findByName(name) { await ensure(); const rows = await sql()`select * from crew where lower(name) = ${String(name).trim().toLowerCase()}`; return rows.length === 1 ? rows[0] : null; },
  async listCrew() { await ensure(); const rows = await sql()`select id, seq, nick, waitlist, created_at from crew where seq > 0 order by seq`; return rows.map(pubCrew); },
  async listCrewAdmin() { await ensure(); return await sql()`select id, seq, name, nick, waitlist, created_at from crew order by seq`; },
  async listWorks() { await ensure(); return await sql()`select id, title, link, (html <> '') as has_html, author, crew_id, created_at from works order by id desc limit 200`; },
  async getWork(id) { await ensure(); const [r] = await sql()`select * from works where id = ${Number(id)}`; return r || null; },
  async createWork(w) {
    await ensure();
    const [r] = await sql()`insert into works (title, link, html, author, crew_id) values (${w.title}, ${w.link || ''}, ${w.html || ''}, ${w.author}, ${w.crew_id ?? null}) returning id, title, link, (html <> '') as has_html, author, crew_id, created_at`;
    await sql()`insert into messages (kind, author, crew_id, text, work_id) values ('work', ${w.author}, ${w.crew_id ?? null}, ${w.title}, ${r.id})`;
    return r;
  },
  async listMessages(after) {
    await ensure();
    if (after > 0) return await sql()`select * from messages where id > ${after} order by id asc limit 200`;
    const rows = await sql()`select * from messages order by id desc limit 80`; return rows.reverse();
  },
  async createMessage(m) { await ensure(); const [r] = await sql()`insert into messages (kind, author, crew_id, text) values (${m.kind || 'chat'}, ${m.author}, ${m.crew_id ?? null}, ${m.text}) returning *`; return r; },
};

/* ---------- 메모리 구현 (로컬 개발용) ---------- */
const mem = { crew: [], works: [], messages: [{ id: 1, kind: 'notice', author: '담당자', crew_id: null, text: '환영한다. 여기는 모이지 않는 학습회다. 만든 것은 위 화면에 올리고, 할 말은 여기서 한다.', work_id: null, created_at: new Date().toISOString() }], settings: { closed: false }, mid: 1, wid: 0 };
const pubWork = ({ html, ...w }) => ({ ...w, has_html: !!html });
mem.crew.push({ id: 0, seq: 0, name: ADMIN_NICK, nick: ADMIN_NICK, nick_key: nickKey(ADMIN_NICK), token: newToken(), waitlist: false, pass_hash: hashPass(adminPass()), created_at: new Date().toISOString() });
const memRepo = {
  async settings() { return { ...mem.settings }; },
  async setClosed(closed) { mem.settings.closed = !!closed; return { ...mem.settings }; },
  async findByNick(nick) { return mem.crew.find(c => c.nick_key === nickKey(nick)) || null; },
  async findByToken(t) { return mem.crew.find(c => c.token === t) || null; },
  async createCrew({ name, nick, password, waitlist }) { const n = mem.crew.filter(c => c.seq > 0).length + 1; const r = { id: n, seq: n, name, nick, nick_key: nickKey(nick), token: newToken(), waitlist: !!waitlist, pass_hash: hashPass(password), created_at: new Date().toISOString() }; mem.crew.push(r); return r; },
  async findByName(name) { const rows = mem.crew.filter(c => c.name.toLowerCase() === String(name).trim().toLowerCase()); return rows.length === 1 ? rows[0] : null; },
  async listCrew() { return mem.crew.filter(c => c.seq > 0).map(pubCrew); },
  async listCrewAdmin() { return mem.crew.map(({ token, nick_key, pass_hash, ...r }) => r); },
  async listWorks() { return mem.works.slice().reverse().map(pubWork); },
  async getWork(id) { return mem.works.find(w => w.id === Number(id)) || null; },
  async createWork(w) { const r = { id: ++mem.wid, title: w.title, link: w.link || '', html: w.html || '', author: w.author, crew_id: w.crew_id ?? null, created_at: new Date().toISOString() }; mem.works.push(r); mem.messages.push({ id: ++mem.mid, kind: 'work', author: w.author, crew_id: w.crew_id ?? null, text: w.title, work_id: r.id, created_at: r.created_at }); return pubWork(r); },
  async listMessages(after) { return after > 0 ? mem.messages.filter(m => m.id > after).slice(0, 200) : mem.messages.slice(-80); },
  async createMessage(m) { const r = { id: ++mem.mid, kind: m.kind || 'chat', author: m.author, crew_id: m.crew_id ?? null, text: m.text, work_id: null, created_at: new Date().toISOString() }; mem.messages.push(r); return r; },
};

export const repo = process.env.DEV_MEM ? memRepo : neonRepo;
export { pubCrew };
