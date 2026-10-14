// ShaderLab no longer uses a service worker. Browsers that installed the old
// one fetch this file on their next update check; it deletes the old caches
// and unregisters itself, so those clients load directly from the network.
// It must not reload open pages: the old worker never served pages or scripts
// (precache without a route), so they are already current.
const oldCacheName = /^(workbox-precache|shaderlab-content-runtime|shaderlab-binary-runtime)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (oldCacheName.test(name)) await caches.delete(name);
    await self.registration.unregister();
  })());
});
