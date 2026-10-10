import { timingSafeEqual } from 'node:crypto';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Send a valid JSON request.'), { status: 400 });
  }
}

function matchesPassword(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected.length) return false;
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function createMarkHandler(secret) {
  return async (req, res, next) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Use POST to mark a question.' });
    }
    if (!secret) return sendJson(res, 503, { error: 'Marking is not configured. Set DSA_MARK_PASSWORD in .env and restart the server.' });
    try {
      const body = await readJson(req);
      if (!Number.isInteger(body.id) || body.id < 1) return sendJson(res, 400, { error: 'A valid question ID is required.' });
      if (!matchesPassword(body.password, secret)) return sendJson(res, 403, { error: 'That password did not match. Try again.' });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      if (error.status) return sendJson(res, error.status, { error: error.message });
      if (typeof next === 'function') return next(error);
      return sendJson(res, 500, { error: 'Could not verify the marking password.' });
    }
  };
}
