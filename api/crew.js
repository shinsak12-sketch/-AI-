import { repo } from './_lib/repo.js';
import { json, handler } from './_lib/http.js';

export default handler(async (req, res) => {
  json(res, 200, { crew: await repo.listCrew() });
});
