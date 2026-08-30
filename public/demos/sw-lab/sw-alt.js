// sw-lab/sw-alt.js — used only for the same-scope / different-script-URL
// registration probe on the page. Never meant to control anything.
self.addEventListener('install', (e) => e.waitUntil(Promise.resolve()));
self.addEventListener('activate', (e) => e.waitUntil(Promise.resolve()));
