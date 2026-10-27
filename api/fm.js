// Fetch Metadata echo — reports the Sec-Fetch-* / Sec-Purpose / Priority headers it received.
// Two response shapes:
//   default      -> JSON echo of the received headers
//   ?as=worker   -> a valid JavaScript worker body that postMessages the same echo back
//                   (a worker script is EVALUATED, so a JSON body would be a JS SyntaxError)
const SEC = ['sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-fetch-user','sec-purpose','priority','origin','referer'];

function snapshot(req) {
  const headers = {};
  for (const h of SEC) headers[h] = req.headers[h] === undefined ? null : req.headers[h];
  return {
    ok: true,
    at: Date.now(),
    method: req.method,
    url: req.url,
    host: req.headers.host || null,
    http: req.httpVersion,
    headers,
    allHeaders: req.headers,
  };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const payload = snapshot(req);

  if (q.as === 'worker') {
    // Valid JS body that hands the observed headers back to the page.
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end('postMessage(' + JSON.stringify(payload) + ');');
  }

  const cors = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }
  res.writeHead(200, cors);
  return res.end(JSON.stringify(payload));
};
