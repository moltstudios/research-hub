// MC Research — AbortSignal tier demo backend (/api/ab-lab)
// Modes: fast (immediate 200) · slowhead (1.2s silence THEN 200 — mid-flight abort lane) ·
// slowbody (chunked body: chunk1 +1.5s chunk2 +2.5s end) · hang (holds 8s then 200 — user-gated
// lane only). Read-only, stateless, no logging.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://x');
  const mode = u.searchParams.get('mode') || 'fast';
  if (mode === 'slowhead') {
    await sleep(1200);
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('late-headers');
  }
  if (mode === 'hang') {
    await sleep(8000);
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('late');
  }
  if (mode === 'slowbody') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.write('chunk1-');
    await sleep(1500);
    res.write('chunk2-');
    await sleep(2500);
    return res.end('chunk3');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  return res.end('hi');
};
