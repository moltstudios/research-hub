// sw-lab/sw.js — Service Worker Lifecycle + Cache Storage demo worker (v6)
// Registered from demos/sw-lab/index.html with default scope = this directory.
// Telemetry: every lifecycle event + fetch decision is broadcast to all clients.
const VERSION = 'v6';
const SHELL_CACHE = `sw-lab-shell-${VERSION}`;      // versioned precache (the production pattern)
const STATIC_CACHE = 'sw-lab-static-v6';             // named cache for the Static Routing API lab
const PRECACHE = ['./asset.txt', './asset.json'];    // the "app shell manifest"

// ---- volatile worker state (this IS a teaching point: the SW is an event-driven
// ---- worker the browser may terminate after ~30s idle; globals reset on restart)
let strategy = 'passthrough';
let offline = false;
let staticRouteBypassBroken = false; // set if the fetch handler ever sees the exact routed URL
const born = Date.now();
const log = [];

function tell(msg) {
  log.push(msg);
  self.clients.matchAll({ includeUncontrolled: true }).then((cs) => {
    for (const c of cs) c.postMessage({ lab: 'sw', msg, at: Date.now() });
  });
}

self.addEventListener('install', (event) => {
  tell(`install: fired (v6 worker, ${self.location.pathname})`);
  const job = (async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(PRECACHE); // atomic: any non-200 => TypeError install failure
    tell(`install: precached ${PRECACHE.length} shell assets into ${SHELL_CACHE}`);

    // Static Routing API (InstallEvent.addRoutes, Ch 123+ / SF 27, FF absent):
    // rules can ONLY be registered at install time of a new worker version.
    if (typeof event.addRoutes === 'function') {
      try {
        const scopeBase = new URL(self.registration.scope).pathname;
        const routedURL = scopeBase + 'static-routed/probe.txt';
        const c = await caches.open(STATIC_CACHE);
        // Cache a SYNTHETIC body under the exact URL. If the route works, fetches
        // resolve to this body and never wake the fetch handler. The real file on
        // disk says something different — that difference is the proof.
        await c.put(
          new Request(routedURL),
          new Response('STATIC-ROUTED CACHE BODY v6 — served from ' + STATIC_CACHE + ' without dispatching a fetch event\n', { headers: { 'content-type': 'text/plain' } })
        );
        await event.addRoutes({
          condition: { urlPattern: new URLPattern({ pathname: scopeBase + 'static-routed/probe.txt' }) },
          source: { cacheName: STATIC_CACHE },
        });
        tell('install: static route added (exact pathname -> ' + STATIC_CACHE + ')');
      } catch (err) {
        tell('install: addRoutes failed: ' + err.name + ' ' + err.message);
      }
    } else {
      tell('install: addRoutes NOT available on this engine (Static Routing API absent)');
    }
  })();
  event.waitUntil(
    job
      .then(() => self.skipWaiting()) // production pattern: new version activates immediately
      .then(() => tell('install: complete, skipWaiting() called'))
  );
});

self.addEventListener('activate', (event) => {
  tell('activate: fired');
  event.waitUntil(
    (async () => {
      // Versioned-cache cleanup: delete only MY OWN stale shell caches.
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      const names = await caches.keys();
      for (const n of names) {
        if (n.startsWith('sw-lab-shell-') && !keep.has(n)) {
          await caches.delete(n);
          tell('activate: deleted stale cache ' + n);
        }
      }
      await self.clients.claim(); // adopt pages opened before activation (no reload needed)
      tell('activate: cleanup done, clients.claim() called');
    })()
  );
});

// ---- fetch interception: the strategy engine --------------------------------
// Strategy + offline flag are set from the page via postMessage. They live in
// worker globals — if the browser terminates this worker for idleness, they
// reset to the defaults. Real apps persist config in a cache entry or IDB.
async function serve(request, event) {
  const started = performance.now();
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request); // exact-URL key match (query included)
  const finish = (src, res) => ({ src, res, ms: (performance.now() - started).toFixed(1) });

  const netFetch = async () => {
    if (offline) throw new Error('OfflineLab: network disabled by demo');
    return fetch(request);
  };

  switch (strategy) {
    case 'passthrough': {
      const res = await netFetch(); // offline => throws => page sees a TypeError
      return finish('network/passthrough', res);
    }
    case 'cache-first': {
      if (cached) return finish('cache HIT', cached);
      const res = await netFetch();
      event.waitUntil(cache.put(request, res.clone()));
      return finish('cache MISS -> network (+cache fill)', res);
    }
    case 'cache-only': {
      if (cached) return finish('cache HIT', cached);
      return finish('cache-only MISS -> 503', new Response('cache-only: request not in cache\n', { status: 503, headers: { 'content-type': 'text/plain' } }));
    }
    case 'network-first': {
      try {
        const res = await netFetch();
        event.waitUntil(cache.put(request, res.clone()));
        return finish('network', res);
      } catch (e) {
        if (cached) return finish('network FAIL -> cache fallback', cached);
        throw e;
      }
    }
    case 'network-falling-back-to-cache': {
      try {
        return finish('network', await netFetch());
      } catch (e) {
        if (cached) return finish('network FAIL -> cache', cached);
        return finish('no network, no cache -> 503', new Response('offline and not cached\n', { status: 503, headers: { 'content-type': 'text/plain' } }));
      }
    }
    case 'stale-while-revalidate': {
      if (cached) {
        event.waitUntil(
          netFetch()
            .then((res) => cache.put(request, res.clone()))
            .then(() => tell(`swr: background revalidate done for ${short(request.url)}`))
            .catch(() => tell('swr: background revalidate skipped (offline)'))
        );
        return finish('cache HIT (stale) + background revalidate', cached);
      }
      const res = await netFetch();
      event.waitUntil(cache.put(request, res.clone()));
      return finish('cache MISS -> network (+cache fill)', res);
    }
    default:
      return finish('network/unknown-strategy', await netFetch());
  }
}

function short(url) {
  try { const u = new URL(url); return u.pathname.slice('/demos/sw-lab/'.length) + (u.search || ''); } catch (e) { return url; }
}

self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  const scopeBase = new URL(self.registration.scope).pathname;
  if (u.pathname === scopeBase + 'static-routed/probe.txt') {
    staticRouteBypassBroken = true; // the route FAILED to bypass us
    tell('fetch: !! static-route bypass FAILED — handler saw the exact routed URL');
  }
  event.respondWith(
    serve(event.request, event).then(({ src, res, ms }) => {
      tell(`fetch: ${short(event.request.url)} | strategy=${strategy} | ${src} (${ms}ms)`);
      return res;
    })
  );
});

// ---- message API -------------------------------------------------------------
self.addEventListener('message', (event) => {
  const d = event.data || {};
  const reply = (obj) => { try { event.source && event.source.postMessage(Object.assign({ lab: 'sw', rid: d.rid }, obj)); } catch (e) {} };
  switch (d.cmd) {
    case 'ping':
      reply({ pong: true, version: VERSION, strategy, offline, staticRouteBypassBroken,
        hasAddRoutes: typeof InstallEvent !== 'undefined' && typeof InstallEvent.prototype.addRoutes === 'function',
        ageS: ((Date.now() - born) / 1000).toFixed(1) });
      break;
    case 'config':
      if (d.strategy) strategy = d.strategy;
      if (typeof d.offline === 'boolean') offline = d.offline;
      tell(`config: strategy=${strategy} offline=${offline}`);
      reply({ ackConfig: true, strategy, offline });
      break;
    case 'evict': {
      const job = (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const gone = await cache.delete(d.url);
        tell('evict: ' + gone + ' ' + d.url);
        return gone;
      })();
      event.waitUntil(job.then((gone) => reply({ evicted: gone })));
      break;
    }
    case 'dumpLog':
      reply({ dump: log.slice(-200) });
      break;
    default:
      reply({ err: 'unknown cmd ' + d.cmd });
  }
});
