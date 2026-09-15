// 공통 HTTP 유틸: JSON 응답, 본문 파싱, 권한 확인
export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

export function isAdmin(req) {
  const pass = process.env.ADMIN_PASS || '7919';
  return (req.headers['x-admin-pass'] || '') === pass;
}

export function token(req) {
  return String(req.headers['x-crew-token'] || '');
}

export const BOARDS = ['notice', 'free', 'works', 'prompts'];

export function clip(v, n) {
  return String(v ?? '').trim().slice(0, n);
}

// 핸들러 래퍼: 예외를 500 JSON으로
export function handler(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      console.error(e);
      json(res, 500, { error: 'server_error', message: e && e.message ? e.message : String(e) });
    }
  };
}
