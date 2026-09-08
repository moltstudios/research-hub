// MC Research — Fetch API demo backend (same-origin /api/* routes)
// Serves: ping, status, slow, stream (chunked download), echo (upload receipt w/ arrival timing),
// redirect (301/302/303 vs 307/308), cache (ETag/304), cookieset, log (in-memory receipts).
// One warm instance keeps LOG in memory — demo-grade, receipts expire after 5 min.
const LOG = new Map();
const LOG_MAX = 60;
function log(tag, entry) {
  const key = String(tag || 'untagged');
  const arr = LOG.get(key) || [];
  arr.push(Object.assign({ at: Date.now() }, entry));
  while (arr.length > 6) arr.shift();
  LOG.set(key, arr);
  if (LOG.size > LOG_MAX) LOG.delete(LOG.keys().next().value);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const p = u.pathname.replace(/^\/api\/?/, '');
  const q = u.searchParams;
  const cors = (o) => Object.assign({ 'Cache-Control': 'no-store' }, o);

  try {
    if (p === 'ping') {
      res.writeHead(200, cors({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ ok: true, t: Date.now(), http: req.httpVersion }));
    }

    if (p === 'status') {
      const code = Math.min(599, Math.max(100, parseInt(q.get('code') || '404', 10)));
      res.writeHead(code, cors({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ served: code, note: 'fetch() resolves — this is not a network error' }));
    }

    if (p === 'slow') {
      const delay = Math.min(20000, parseInt(q.get('delay') || '2500', 10));
      await sleep(delay);
      res.writeHead(200, cors({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ arrived: true, delay, http: req.httpVersion }));
    }

    if (p === 'stream') {
      const chunks = Math.min(40, Math.max(1, parseInt(q.get('chunks') || '8', 10)));
      const size = Math.min(16384, Math.max(4, parseInt(q.get('size') || '2048', 10)));
      const delay = Math.min(2000, parseInt(q.get('delay') || '120', 10));
      res.writeHead(200, cors({ 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked', 'X-Stream-Plan': JSON.stringify({ chunks, size, delay }) }));
      for (let i = 0; i < chunks; i++) {
        await sleep(delay);
        res.write('C' + i + ':' + 'x'.repeat(size) + '\n');
      }
      res.end();
      return;
    }

    if (p === 'echo' || p === 'echo/slow') {
      const t0 = Date.now();
      const chunks = [];
      let bytes = 0;
      const reader = req.pipe ? null : null; // Vercel: req is a stream
      await new Promise((resolve, reject) => {
        req.on('data', (c) => { chunks.push({ off: bytes, len: c.length, dt: Date.now() - t0 }); bytes += c.length; });
        req.on('end', resolve);
        req.on('error', reject);
      });
      const bodyDelay = p === 'echo/slow' ? Math.min(1500, parseInt(q.get('delay') || '0', 10)) : 0;
      if (bodyDelay) await sleep(bodyDelay);
      const payload = {
        ok: true,
        method: req.method,
        bytes,
        chunkCount: chunks.length,
        chunkArrivals: chunks,
        contentType: req.headers['content-type'] || null,
        http: req.httpVersion,
        tag: q.get('tag') || null,
        seenAt: Date.now(),
      };
      if (q.get('tag')) log(q.get('tag'), { method: req.method, bytes, http: req.httpVersion, chunkCount: chunks.length });
      res.writeHead(200, cors({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify(payload));
    }

    if (p === 'redirect') {
      const code = parseInt(q.get('code') || '301', 10);
      const to = q.get('to') || '/api/echo?from=redirect';
      const safe = to.startsWith('/') ? to : '/api/echo?from=redirect';
      res.writeHead(code, cors({ Location: safe }));
      return res.end();
    }

    if (p === 'cache') {
      const etag = '"v-forty-two"';
      const inm = req.headers['if-none-match'];
      if (inm === etag) {
        res.writeHead(304, cors({ ETag: etag }));
        return res.end();
      }
      res.writeHead(200, cors({ 'Content-Type': 'application/json', ETag: etag }));
      return res.end(JSON.stringify({ answer: 42, etag, http: req.httpVersion }));
    }

    if (p === 'cookieset') {
      res.writeHead(200, cors({
        'Content-Type': 'application/json',
        'Set-Cookie': ['mc_fetch_lab=a; Path=/api', 'mc_fetch_lab2=b; Path=/api'],
      }));
      return res.end(JSON.stringify({ set: 2 }));
    }

    if (p === 'log') {
      const tag = q.get('tag');
      if (tag) {
        const arr = LOG.get(tag) || [];
        // purge >5min
        const fresh = arr.filter((e) => Date.now() - e.at < 5 * 60 * 1000);
        res.writeHead(200, cors({ 'Content-Type': 'application/json' }));
        return res.end(JSON.stringify({ tag, receipts: fresh }));
      }
      const all = {};
      for (const [k, v] of LOG) all[k] = v.filter((e) => Date.now() - e.at < 5 * 60 * 1000);
      res.writeHead(200, cors({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify(all));
    }

    if (p === 'integrity') {
      res.writeHead(200, cors({ 'Content-Type': 'text/plain' }));
      return res.end('INTEGRITY-PAYLOAD-42\n');
    }

    res.writeHead(404, cors({ 'Content-Type': 'application/json' }));
    return res.end(JSON.stringify({ error: 'no such lab route', path: p }));
  } catch (e) {
    res.writeHead(500, cors({ 'Content-Type': 'application/json' }));
    return res.end(JSON.stringify({ error: String(e && e.message || e) }));
  }
};
