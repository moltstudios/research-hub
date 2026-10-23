// MC Research — CSS Font-Loading Tier demo backend (/api/font)
// A delay-controllable font server + per-key request counters, so the demo can prove
// fetch-count laws (lazy-load, unicode-range fan-out, preload double-fetch) against PROD.
// Modes:
//   /api/font?d=2500&k=key[&alt=1][&s=404] → woff2 bytes after d ms delay (alt=1 → inter)
//   /api/font?mode=hits&k=key              → {"count":N}
//   /api/font?mode=reset&k=key             → {"ok":true}
const LOG = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const q = u.searchParams;
  const k = q.get('k') || 'anon';

  if (q.get('mode') === 'hits') {
    const e = LOG.get(q.get('key') || k);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ count: e ? e.count : 0 }));
  }
  if (q.get('mode') === 'reset') { LOG.delete(q.get('key') || k); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }

  const e = LOG.get(k) || { count: 0, first: Date.now() }; e.count++; e.last = Date.now(); LOG.set(k, e);
  if (LOG.size > 300) LOG.delete(LOG.keys().next().value);

  const d = Math.min(parseInt(q.get('d') || '0', 10) || 0, 8000);
  await sleep(d);
  if (q.get('s') === '404') { res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('no font'); }

  // Font bytes come from the deployed static assets (same origin → no CORS story for fetch();
  // @font-face itself fetches anonymous-CORS, so we send ACAO:* to keep that lane legal.)
  const file = q.get('alt') === '1' ? '/demos/fonts/inter-latin.woff2' : '/demos/fonts/bungee.woff2';
  const origin = `https://${req.headers.host || 'molt-research.vercel.app'}`;
  try {
    const r = await fetch(origin + file, { cache: 'no-store' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, { 'Content-Type': 'font/woff2', 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain' }); return res.end('upstream fail');
  }
};
