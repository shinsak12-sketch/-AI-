// 데이터 계층. DEV_MEM=1 이면 메모리 저장소(로컬 개발), 아니면 Neon Postgres.
import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';

const newToken = () => randomBytes(24).toString('hex');
const nickKey = s => String(s).trim().toLowerCase();

/* ---------- Neon 구현 ---------- */
let _sql = null, _ready = null;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 없음');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
async function ensure() {
  if (!_ready) {
    _ready = (async () => {
      const s = sql();
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
      await s`create table if not exists settings (key text primary key, value jsonb not null)`;
      await s`insert into settings (key, value) values ('main', '{"closed": false}') on conflict (key) do nothing`;
      await s`insert into posts (board, title, body, author)
        select 'notice', '1기 첫 모임 안내', '일정과 장소는 명부 마감 후 이 게시판에 올린다. 준비물: 노트북, AI 계정(무료 가능), 없애고 싶은 반복 업무 하나.', '담당자'
        where not exists (select 1 from posts)`;
    })();
  }
  return _ready;
}
const pubCrew = r => ({ id: r.id, seq: r.seq, nick: r.nick, waitlist: r.waitlist, created_at: r.created_at });

const neonRepo = {
  async settings() { await ensure(); const [r] = await sql()`select value from settings where key = 'main'`; return r ? r.value : { closed: false }; },
  async setClosed(closed) { await ensure(); await sql()`insert into settings (key, value) values ('main', ${JSON.stringify({ closed: !!closed })}::jsonb) on conflict (key) do update set value = excluded.value`; return { closed: !!closed }; },
  async findByNick(nick) { await ensure(); const [r] = await sql()`select * from crew where nick_key = ${nickKey(nick)}`; return r || null; },
  async findByToken(t) { if (!t) return null; await ensure(); const [r] = await sql()`select * from crew where token = ${t}`; return r || null; },
  async createCrew({ name, nick, waitlist }) {
    await ensure();
    const tok = newToken();
    const [r] = await sql()`insert into crew (seq, name, nick, nick_key, token, waitlist)
      values ((select coalesce(max(seq), 0) + 1 from crew), ${name}, ${nick}, ${nickKey(nick)}, ${tok}, ${!!waitlist}) returning *`;
    return r;
  },
  async listCrew() { await ensure(); const rows = await sql()`select id, seq, nick, waitlist, created_at from crew order by seq`; return rows.map(pubCrew); },
  async listCrewAdmin() { await ensure(); return await sql()`select id, seq, name, nick, waitlist, created_at from crew order by seq`; },
  async listPosts(board) { await ensure(); return await sql()`select id, board, title, body, prompt, link, author, created_at from posts where board = ${board} order by created_at desc limit 200`; },
  async createPost(p) {
    await ensure();
    const [r] = await sql()`insert into posts (board, title, body, prompt, link, author, crew_id)
      values (${p.board}, ${p.title}, ${p.body || ''}, ${p.prompt || ''}, ${p.link || ''}, ${p.author}, ${p.crew_id ?? null}) returning id, board, title, body, prompt, link, author, created_at`;
    return r;
  },
};

/* ---------- 메모리 구현 (로컬 개발용) ---------- */
const mem = { crew: [], posts: [{ id: 1, board: 'notice', title: '1기 첫 모임 안내', body: '일정과 장소는 명부 마감 후 이 게시판에 올린다. 준비물: 노트북, AI 계정(무료 가능), 없애고 싶은 반복 업무 하나.', prompt: '', link: '', author: '담당자', created_at: new Date().toISOString() }], settings: { closed: false }, seq: 1 };
const memRepo = {
  async settings() { return { ...mem.settings }; },
  async setClosed(closed) { mem.settings.closed = !!closed; return { ...mem.settings }; },
  async findByNick(nick) { return mem.crew.find(c => c.nick_key === nickKey(nick)) || null; },
  async findByToken(t) { return mem.crew.find(c => c.token === t) || null; },
  async createCrew({ name, nick, waitlist }) { const r = { id: mem.crew.length + 1, seq: mem.crew.length + 1, name, nick, nick_key: nickKey(nick), token: newToken(), waitlist: !!waitlist, created_at: new Date().toISOString() }; mem.crew.push(r); return r; },
  async listCrew() { return mem.crew.map(pubCrew); },
  async listCrewAdmin() { return mem.crew.map(({ token, nick_key, ...r }) => r); },
  async listPosts(board) { return mem.posts.filter(p => p.board === board).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
  async createPost(p) { const r = { id: ++mem.seq, board: p.board, title: p.title, body: p.body || '', prompt: p.prompt || '', link: p.link || '', author: p.author, crew_id: p.crew_id ?? null, created_at: new Date().toISOString() }; mem.posts.push(r); return r; },
};

export const repo = process.env.DEV_MEM ? memRepo : neonRepo;
export { pubCrew };
