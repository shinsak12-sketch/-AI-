import { repo } from './_lib/repo.js';
import { json, body, clip, token, isAdmin, BOARDS, handler } from './_lib/http.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const board = String((req.query && req.query.board) || '');
    if (!BOARDS.includes(board)) return json(res, 400, { error: 'bad_board' });
    return json(res, 200, { posts: await repo.listPosts(board) });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const b = body(req);
  const board = String(b.board || '');
  if (!BOARDS.includes(board)) return json(res, 400, { error: 'bad_board' });
  let author, crew_id = null;
  if (board === 'notice') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin_only' });
    author = '담당자';
  } else {
    const me = await repo.findByToken(token(req));
    if (!me) return json(res, 401, { error: 'not_crew' });
    author = me.nick; crew_id = me.id;
  }
  const post = { board, title: clip(b.title, 60), body: clip(b.body, 2000), prompt: clip(b.prompt, 4000), link: clip(b.link, 500), author, crew_id };
  if (!post.title) return json(res, 400, { error: 'title_required' });
  if (board === 'prompts' && !post.prompt) return json(res, 400, { error: 'prompt_required' });
  if ((board === 'free' || board === 'notice') && !post.body) return json(res, 400, { error: 'body_required' });
  if (post.link && !/^https?:\/\//i.test(post.link)) return json(res, 400, { error: 'bad_link' });
  json(res, 201, { post: await repo.createPost(post) });
});
