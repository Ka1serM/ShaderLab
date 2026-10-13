// ShaderLab no longer uses a service worker. Browsers that installed the old
// one fetch this file on their next update check; it deletes the old caches
// and unregisters itself, so those clients load directly from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
