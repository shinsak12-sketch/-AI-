import { repo } from '../_lib/repo.js';
import { json, isAdmin, handler } from '../_lib/http.js';

export default handler(async (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'forbidden' });
  json(res, 200, { crew: await repo.listCrewAdmin(), settings: await repo.settings() });
});
