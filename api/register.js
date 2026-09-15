import { repo, pubCrew } from './_lib/repo.js';
import { json, body, clip, handler } from './_lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const b = body(req);
  const name = clip(b.name, 20), nick = clip(b.nick, 12);
  if (!name) return json(res, 400, { error: 'name_required' });
  if (!nick) return json(res, 400, { error: 'nick_required' });
  const ex = await repo.findByNick(nick);
  if (ex) {
    // 같은 이름으로 같은 닉네임을 다시 넣으면 재입장(기존 기록 반환). 이름이 다르면 닉네임 중복.
    if (ex.name.trim().toLowerCase() === name.toLowerCase()) return json(res, 200, { crew: pubCrew(ex), token: ex.token, existing: true });
    return json(res, 409, { error: 'nick_taken' });
  }
  const { closed } = await repo.settings();
  const r = await repo.createCrew({ name, nick, waitlist: !!closed });
  json(res, 201, { crew: pubCrew(r), token: r.token, existing: false });
});
