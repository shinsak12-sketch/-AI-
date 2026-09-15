// 로컬 개발 서버: public/ 정적 파일 + api/ 핸들러를 Vercel과 비슷한 req/res 로 실행. 저장은 메모리(DEV_MEM=1).
process.env.DEV_MEM = process.env.DEV_MEM || '1';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const PORT = Number(process.env.PORT || 3000);

async function readJson(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = join(root, url.pathname + '.js');
      const mod = await import(pathToFileURL(file).href);
      req.query = Object.fromEntries(url.searchParams);
      req.body = req.method === 'POST' ? await readJson(req) : {};
      res.status = c => { res.statusCode = c; return res; };
      res.json = b => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); };
      return mod.default(req, res);
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    let f = join(root, 'public', p);
    try { await stat(f); } catch { f = join(root, 'public', p + '.html'); }
    const data = await readFile(f);
    res.setHeader('Content-Type', types[extname(f)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    res.statusCode = e.code === 'ENOENT' ? 404 : 500; res.end(e.code === 'ENOENT' ? 'not found' : String(e));
  }
});
server.listen(PORT, () => console.log(`dev server http://localhost:${PORT} (DEV_MEM=${process.env.DEV_MEM})`));
