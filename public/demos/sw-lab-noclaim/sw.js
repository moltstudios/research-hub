// sw-lab-noclaim/sw.js — the control-flow control: installs and activates but
// deliberately does NOT call clients.claim(). Pages that loaded BEFORE this
// worker activated stay uncontrolled until they are reloaded. That asymmetry
// is the single most misunderstood service worker lifecycle fact.
self.addEventListener('install', (event) => {
  event.waitUntil(Promise.resolve());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((cs) => {
      for (const c of cs) c.postMessage({ lab: 'noclaim', msg: 'activate: fired WITHOUT claim — pre-existing pages stay uncontrolled until reload' });
    })
  );
});
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.cmd === 'ping' && event.source) {
    event.source.postMessage({ lab: 'noclaim', pong: true, controller: null });
  }
});
