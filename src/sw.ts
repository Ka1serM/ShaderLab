/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precache } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision?: string | null }> };

const contentCacheName = 'shaderlab-content-runtime-v1';
const binaryCacheName = 'shaderlab-binary-runtime-v1';
const contentPath = new URL('content/', self.registration.scope).pathname;
const modelsPath = new URL('models/', self.registration.scope).pathname;
const texturesPath = new URL('textures/', self.registration.scope).pathname;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Install a complete offline snapshot without registering Workbox's usual
// cache-first route. Course content below has its own network-first handler.
precache(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith(contentPath),
  async ({ request }) => {
    try {
      // Respect live course editing: every online request goes to the server.
      const response = await fetch(request);
      if (!response.ok) return response;
      const cache = await caches.open(contentCacheName);
      await cache.put(request, response.clone());
      return response;
    } catch {
      // Offline, first prefer the last successfully fetched file, then the
      // install-time snapshot bundled with this PWA version.
      const cached = await (await caches.open(contentCacheName)).match(request);
      return cached ?? await matchPrecache(request) ?? new Response('Offline content unavailable.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
);

// Large binary assets stay off the critical install path. Cache them after
// their first successful request so subsequent visits and offline use are fast.
registerRoute(
  ({ url }) => url.pathname.startsWith(modelsPath) || url.pathname.startsWith(texturesPath),
  async ({ request }) => {
    const cache = await caches.open(binaryCacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return new Response('Offline asset unavailable.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
);
