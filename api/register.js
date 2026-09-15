import { repo, pubCrew } from './_lib/repo.js';
import { json, body, clip, handler } from './_lib/http.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const b = body(req);
  const name = clip(b.name, 20), nick = clip(b.nick, 12), password = String(b.password || '');
  if (!name) return json(res, 400, { error: 'name_required' });
  if (!nick) return json(res, 400, { error: 'nick_required' });
  if (password.length < 4 || password.length > 64) return json(res, 400, { error: 'password_short' });
  if (await repo.findByNick(nick)) return json(res, 409, { error: 'nick_taken' });
  const { closed } = await repo.settings();
  const r = await repo.createCrew({ name, nick, password, waitlist: !!closed });
  json(res, 201, { crew: pubCrew(r), token: r.token });
});
