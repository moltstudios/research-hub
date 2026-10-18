// MC Research — Server-Sent Events demo backend (/api/sse)
// Modes: telemetry (OpenDrones feed w/ resume echo + deliberate drops) · grammar (the wire-grammar
// sequence incl. NUL id + 1MB message) · drop (retry-hint lanes for reconnect deltas) · hang
// (headers only) · hold (comment heartbeats for the pool law) · info (JSON hop report) ·
// reqlog (per-key request counters) · case walls (204/404/mime/json).
const LOG = new Map(); // key -> { count, first, last }
const bump = (key) => {
  const k = String(key || 'untagged');
  const e = LOG.get(k) || { count: 0, first: Date.now() };
  e.count++; e.last = Date.now();
  LOG.set(k, e);
  if (LOG.size > 200) LOG.delete(LOG.keys().next().value);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SSE_HDRS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const q = u.searchParams;
  const mode = q.get('mode');
  const cs = q.get('case');
  const lei = req.headers['last-event-id'] || null;
  const key = (q.get('key') ? q.get('key') + ':' : '') + (cs ? 'case:' + cs : 'mode:' + mode + (q.get('retry') !== null ? '&retry=' + q.get('retry') : '') + (q.get('worker') ? '&worker' : ''));
  if (mode === 'reqlog') {
    const want = q.get('key');
    const e = LOG.get(want) || { count: 0 };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ count: e.count }));
  }
  bump(key);

  try {
    // ---- walls ----
    if (cs === '204') { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end(); }
    if (cs === '404') { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('nope'); }
    if (cs === '500') { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end('boom'); }
    if (cs === 'mime') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('data: not-sse\n\n'); }
    if (cs === 'json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{}'); }

    // ---- JSON lanes ----
    if (mode === 'info') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ proto: req.httpVersion, lei, t: Date.now() }));
    }

    // ---- hang: headers only ----
    if (mode === 'hang') {
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      await sleep(3000);
      return res.end();
    }

    // ---- hold: comment heartbeats ----
    if (mode === 'hold') {
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      for (let i = 0; i < 40; i++) { await sleep(500); res.write(': beat\n\n'); }
      return res.end();
    }

    // ---- redi: redirect lane (same-origin or cross-origin landing) ----
    if (mode === 'redi') {
      const to = q.get('to');
      const code = parseInt(q.get('code') || '302', 10);
      bump(key);
      res.writeHead(code, { Location: to });
      return res.end();
    }

    // ---- tokens: the AI-capstone stream (fetch-lane POST demo) ----
    if (mode === 'tokens') {
      bump(key);
      const lei0 = lei;
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      const answer = ['Server', '-', 'sent', 'events', 'are', 'the', 'push', 'tier', 'every', 'AI', 'widget', 'already', 'speaks', '.', 'No', 'sockets', ',', 'no', 'SDKs', ',', 'just', 'HTTP', '.'];
      res.write(`retry: 800\n`);
      res.write(`event: meta\ndata: ${JSON.stringify({ model: 'molt-demo-1', lei: lei0 })}\n\n`);
      let alive = true;
      req.on('close', () => { alive = false; });
      for (let i = 0; i < answer.length && alive; i++) {
        res.write(`event: token\ndata: ${JSON.stringify({ t: answer[i], i })}\n\n`);
        await sleep(90 + Math.random() * 120);
      }
      if (alive) { res.write(`event: done\ndata: {"usage":{"tokens":${answer.length}}}\n\n`); }
      return res.end();
    }

    // ---- grammar: the wire-grammar pass ----
    if (mode === 'grammar') {
      const frames = [
        '\uFEFF: open keep-alive comment only (BOM swallowed)\n\n',
        'data: hello\n\n',
        'data: line1\ndata: line2\n\n',
        'data:nospace\n\n',
        'data:  two lead\n\n',
        'event: telemetry\ndata: {"batt":84}\n\n',
        'event: ghost\n\n',
        'id: 42\ndata: after-id\n\n',
        'data: no-id-here\n\n',
        'id: n\u0000ul\ndata: after-nul\n\n',
        'foo: ignored-field\ndata: unknown-ok\n\n',
        'data\n\n',
        'id: 9\n\n',
        'data: after-lonely-id\n\n',
        'data: cr-end\r\ndata: crlf-end\r\n\n',
        'event: t1\ndata: a\n\nevent:\ndata: b\n\n',
        'data: ' + 'x'.repeat(1048576) + '\n\n',
      ];
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      let i = 0;
      for (const f of frames) { res.write(f); await sleep(160); }
      return res.end();
    }

    // ---- drop: reconnect-delta lanes ----
    if (mode === 'drop') {
      const retry = q.get('retry'); // raw — may be '120' | '0' | '12x' | '-5'
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      res.write(`event: resume\ndata: ${JSON.stringify({ lei })}\n\n`);
      let n = lei ? parseInt(lei, 10) || 0 : 0;
      let alive = true;
      req.on('close', () => { alive = false; });
      for (let i = 0; i < 6 && alive; i++) {
        res.write(`${retry !== null ? 'retry: ' + retry + '\n' : ''}id: ${++n}\ndata: tick-${n}\n\n`);
        await sleep(100);
      }
      if (alive) res.destroy(); // mid-stream drop
      return;
    }

    // ---- telemetry: the capstone feed ----
    if (mode === 'telemetry') {
      const worker = q.get('worker') === '1';
      res.writeHead(200, SSE_HDRS);
      res.flushHeaders && res.flushHeaders();
      res.write(`retry: 900\n`);
      res.write(`event: resume\ndata: ${JSON.stringify({ lei })}\n\n`);
      let n = lei ? parseInt(lei, 10) || 0 : 0;
      let batt = lei ? 84 - Math.random() * 8 : 92;
      let alive = true;
      req.on('close', () => { alive = false; });
      const TOTAL = worker ? 3 : 14;
      for (let i = 0; i < TOTAL && alive; i++) {
        n++;
        batt = Math.max(12, batt - 0.4 - Math.random() * 0.5);
        const tlm = {
          batt: +batt.toFixed(1), alt: 118 + Math.sin(n / 5) * 22 + Math.random() * 4,
          spd: +(6 + Math.abs(Math.cos(n / 7)) * 8 + Math.random()).toFixed(1),
          sats: 14 + (Math.random() * 6 | 0), rssi: -71 + (Math.random() * 8 | 0),
          hdg: Math.round((n * 7) % 360),
        };
        res.write(`id: ${n}\nevent: tlm\ndata: ${JSON.stringify(tlm)}\n\n`);
        await sleep(worker ? 120 : 600);
      }
      if (alive) res.write(`event: status\ndata: {"note":"server drop — reconnecting","n":${n}}\n\n`);
      if (alive) res.destroy(); // deliberate mid-stream drop → client auto-reconnects w/ Last-Event-ID
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('nf');
  } catch (e) {
    try { res.destroy(); } catch {}
  }
};
