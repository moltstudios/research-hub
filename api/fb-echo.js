// MC Research — File & Blob tier demo backend (/api/fb-echo)
//
// A multipart echo endpoint. It captures the RAW request body and the request
// headers, so the demo can show the bytes the SERVER actually receives when a
// FormData carries a Blob, a named Blob, a File, or a File with an empty name.
//
// This is the ground truth for the multipart filename law: the browser's
// FormData object hides the filename it will send; the wire does not.
//
//   POST /api/fb-echo  →  {"bytes":N,"ct":"...","body":"...","headers":{...}}
const MAX = 64 * 1024;   // enough for the demo's 1 KiB body, capped for safety

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ error: 'POST only' }));
  }
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total <= MAX) chunks.push(c);
    else break;
  }
  const body = Buffer.concat(chunks).toString('utf8');
  const headers = {};
  Object.keys(req.headers).forEach((k) => {
    headers[k] = String(req.headers[k]);
  });
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  return res.end(JSON.stringify({ bytes: total, ct: req.headers['content-type'] || '', body, headers }));
};
