// Version this name whenever the offline document or precached assets change.
export const PLATFORM_CACHE = "nfe-start-public-v1";
export const PUBLIC_ASSETS = [
	"/offline.html",
	"/logo.svg",
	"/icons/192.png",
	"/icons/512.png",
] as const;

export const offlineDocument = `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Hors connexion / Offline · NFE</title>
<style>body{font:1.125rem system-ui,sans-serif;max-width:40rem;margin:10vh auto;padding:1.5rem;line-height:1.6;color:#171717;background:#fff}a{color:#174497}a:focus-visible{outline:3px solid #174497;outline-offset:4px}@media(prefers-color-scheme:dark){body{background:#171717;color:#fafafa}a{color:#a8c7ff}}</style>
<main><img src="/icons/192.png" width="72" height="72" alt=""><h1>Vous êtes hors connexion</h1>
<p>Reconnectez-vous pour consulter NFE. Aucune donnée de compte n’est disponible hors ligne.</p>
<p><a href="/fr">Réessayer en français</a></p>
<section lang="en"><h2>You are offline</h2><p>Reconnect to use NFE. Account data is unavailable offline.</p>
<p><a href="/en">Retry in English</a></p></section></main></html>`;

// No runtime cache writes. In particular, never match paths by extension:
// signed/private media and RPC can look like otherwise public files.
export const serviceWorker = `"use strict";
const CACHE = ${JSON.stringify(PLATFORM_CACHE)};
const PUBLIC = ${JSON.stringify(PUBLIC_ASSETS)};
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const path of PUBLIC) {
      const response = await fetch(path, {cache: "no-store", credentials: "omit", redirect: "error"});
      if (!response.ok) throw new Error("Public offline asset unavailable");
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // This dedicated app origin owns its CacheStorage. Purge legacy Workbox,
    // Next HTML, images and signed URLs before claiming any existing tabs.
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // Native media transport owns cross-origin Range requests and signed URLs.
  // Re-fetching an opaque media response here can turn a partial request into
  // a full download and consume a short capability before seeking completes.
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  if (url.origin === self.location.origin && !url.search && PUBLIC.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(request, {cache: "no-store"})));
    return;
  }
  // Network only, bypassing HTTP cache too; never fall back to cached HTML.
  event.respondWith(fetch(request, {cache: "no-store"}).catch(async () => {
    if (request.mode !== "navigate") return Response.error();
    const offline = await (await caches.open(CACHE)).match("/offline.html");
    return offline ? new Response(await offline.text(), {status: 503, headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store"}}) : Response.error();
  }));
});`;

export const platformManifest = {
	id: "/",
	name: "Next Football Experience",
	short_name: "NFE",
	description: "La communauté du football / The football community",
	start_url: "/",
	scope: "/",
	display: "standalone",
	background_color: "#ffffff",
	theme_color: "#FACC15",
	lang: "fr",
	icons: [192, 512].map((size) => ({
		src: `/icons/${size}.png`,
		sizes: `${size}x${size}`,
		type: "image/png",
		purpose: "any",
	})),
};
