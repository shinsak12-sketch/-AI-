import { repo } from '../_lib/repo.js';
import { json, body, isAdmin, handler } from '../_lib/http.js';

export default handler(async (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'forbidden' });
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const b = body(req);
  json(res, 200, await repo.setClosed(!!b.closed));
});
