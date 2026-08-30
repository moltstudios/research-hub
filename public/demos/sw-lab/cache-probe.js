// cache-probe.js — a plain dedicated Web Worker. Proves CacheStorage is a
// general secure-context API: no service worker registration is involved.
onmessage = async () => {
  try {
    const c = await caches.open('sw-lab-worker-probe');
    await c.put('/worker-put-key', new Response('from-worker'));
    const keys = await c.keys();
    postMessage({ ok: true, entries: keys.length, hasCaches: typeof caches !== 'undefined' });
  } catch (e) {
    postMessage({ ok: false, err: e.name + ': ' + e.message });
  }
};
