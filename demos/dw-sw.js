// dw-sw.js — Deferred Work tier demo service worker (scope: /demos/)
// Handles: sync (with in-memory done-set demonstrating the dup-fire mitigation),
// periodicsync, backgroundfetch* events, and a scope census on request.
const POST = async (type, data) => {
  const cls = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of cls) c.postMessage(Object.assign({ __dw: true, type, t: Math.round(performance.now()) }, data));
};
const DONE = new Set(); // in-memory dup dedupe — honest label: survives only while THIS worker lives; production = IndexedDB

self.addEventListener('sync', (e) => {
  e.waitUntil((async () => {
    const seen = DONE.has(e.tag);
    DONE.add(e.tag);
    await POST('sync', { tag: e.tag, tagLen: String(e.tag).length, lastChance: e.lastChance, seenBefore: seen, evtName: e.constructor.name });
  })());
});

self.addEventListener('periodicsync', (e) => {
  e.waitUntil(POST('periodicsync', { tag: e.tag, evtName: e.constructor.name }));
});

['backgroundfetchsuccess', 'backgroundfetchfail', 'backgroundfetchabort', 'backgroundfetchclick'].forEach((t) => {
  self.addEventListener(t, (e) => {
    e.waitUntil(POST(t, {
      id: e.id, evtName: e.constructor.name, hasUpdateUI: typeof e.updateUI === 'function',
      downloaded: e.registration.downloaded, downloadTotal: e.registration.downloadTotal,
      result: e.registration.result, failureReason: e.registration.failureReason,
      recordsAvailable: e.registration.recordsAvailable
    }));
  });
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.__census) {
    POST('sw-census', {
      syncMgr: typeof self.registration.sync, periodicSyncMgr: typeof self.registration.periodicSync, backgroundFetchMgr: typeof self.registration.backgroundFetch,
      SyncEvent: typeof SyncEvent, PeriodicSyncEvent: typeof PeriodicSyncEvent, BackgroundFetchEvent: typeof BackgroundFetchEvent,
      doneSet: Array.from(DONE).map((s) => String(s).slice(0, 24))
    }).catch(() => {});
  }
});
