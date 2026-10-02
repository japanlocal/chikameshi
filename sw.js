// Service Worker: アプリ本体と地図をキャッシュしてオフラインでも起動できるようにする
// アプリのファイルを変更したら VERSION を上げる

const VERSION = 'v1';
const SHELL_CACHE = `chikameshi-shell-${VERSION}`;
const TILE_CACHE = 'chikameshi-tiles';
const MAX_TILES = 300;

const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'data.js',
  'sources.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('chikameshi-shell-') && k !== SHELL_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 地図タイル: 一度見た場所はオフラインでも表示できるようにする
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(request, TILE_CACHE, MAX_TILES));
    return;
  }

  // アプリ本体と Leaflet: キャッシュを即返しつつ裏で更新 (次回起動時に反映)
  if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    event.respondWith(staleWhileRevalidate(request));
  }

  // 店舗検索 API (ホットペッパー / Overpass) は常にネットワークへ
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const res = await network;
  if (res) return res;
  if (request.mode === 'navigate') return cache.match('index.html');
  return Response.error();
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') {
      await cache.put(request, res.clone());
      trimCache(cache, maxEntries);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}
