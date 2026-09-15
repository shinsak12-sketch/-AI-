import { repo, pubCrew, checkPass } from './_lib/repo.js';
import { json, body, clip, handler } from './_lib/http.js';

// 닉네임 또는 이름 + 비밀번호로 재입장. 이름은 명부에 한 명뿐일 때만 통함.
export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const b = body(req);
  const id = clip(b.id, 20), password = String(b.password || '');
  if (!id || !password) return json(res, 400, { error: 'missing' });
  const r = (await repo.findByNick(id)) || (await repo.findByName(id));
  if (!r || !checkPass(password, r.pass_hash)) return json(res, 401, { error: 'bad_login' });
  json(res, 200, { crew: pubCrew(r), token: r.token });
});
