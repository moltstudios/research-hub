/* notifications-sw.js — the SW door for the Notification engine-tier demo.
 * Deliberately dumb: registers, claims, answers census pings. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'census') return;
  const has = typeof Notification === 'function';
  e.source.postMessage({
    type: 'census',
    hasNotification: has,
    hasShow: !!(self.registration && typeof self.registration.showNotification === 'function'),
    hasGet: !!(self.registration && typeof self.registration.getNotifications === 'function'),
    perm: has ? Notification.permission : 'absent'
  });
});

/* notificationclick routing — the SW door's click lane (manual/headed test). */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/demos/notifications-api-engine-tier.html');
  }));
});
