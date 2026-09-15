import { repo } from './_lib/repo.js';
import { json, body, clip, token, isAdmin, handler } from './_lib/http.js';

// GET /api/chat?after=ID  → 그 이후 메시지 (없으면 최근 80개)
// POST /api/chat {text}   → 크루 토큰이면 chat, 담당자 암호면 notice
export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const after = Number((req.query && req.query.after) || 0) || 0;
    return json(res, 200, { messages: await repo.listMessages(after) });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const text = clip(body(req).text, 500);
  if (!text) return json(res, 400, { error: 'empty' });
  if (isAdmin(req)) return json(res, 201, { message: await repo.createMessage({ kind: 'notice', author: '담당자', text }) });
  const me = await repo.findByToken(token(req));
  if (!me) return json(res, 401, { error: 'not_crew' });
  json(res, 201, { message: await repo.createMessage({ kind: 'chat', author: me.nick, crew_id: me.id, text }) });
});
