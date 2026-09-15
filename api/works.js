import { repo } from './_lib/repo.js';
import { json, body, clip, token, handler } from './_lib/http.js';

// GET /api/works        → 목록 (html 제외, has_html)
// GET /api/works?id=N   → 한 건 (html 포함)
// POST /api/works {title, link?, html?} → 작품 등록 + 채팅에 알림
export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (id) { const w = await repo.getWork(id); return w ? json(res, 200, { work: w }) : json(res, 404, { error: 'not_found' }); }
    return json(res, 200, { works: await repo.listWorks() });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const me = await repo.findByToken(token(req));
  if (!me) return json(res, 401, { error: 'not_crew' });
  const b = body(req);
  const w = { title: clip(b.title, 60), link: clip(b.link, 500), html: String(b.html || '').trim(), author: me.nick, crew_id: me.id };
  if (!w.title) return json(res, 400, { error: 'title_required' });
  if (!w.link && !w.html) return json(res, 400, { error: 'link_or_html' });
  if (w.link && !/^https?:\/\//i.test(w.link)) return json(res, 400, { error: 'bad_link' });
  if (w.html.length > 300000) return json(res, 400, { error: 'html_too_big' });
  json(res, 201, { work: await repo.createWork(w) });
});
