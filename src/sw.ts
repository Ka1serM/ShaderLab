/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, cleanupOutdatedCaches, matchPrecache, precache } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision?: string | null }> };

const contentCacheName = 'shaderlab-content-runtime-v1';
const contentPath = new URL('content/', self.registration.scope).pathname;
const appShellPath = new URL('index.html', self.registration.scope).pathname;

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

// Dynamic task and teaching URLs do not have individual prerendered HTML.
// The app shell lets those routes hydrate and load their offline Markdown.
registerRoute(new NavigationRoute(createHandlerBoundToURL(appShellPath)));
