import { repo } from './_lib/repo.js';
import { json, handler } from './_lib/http.js';

export default handler(async (req, res) => {
  const s = await repo.settings();
  json(res, 200, { closed: !!s.closed });
});
