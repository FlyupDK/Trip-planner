/* 나의 여행 플래너 – 데이터 절약용 서비스 워커
   index.html과 같은 폴더(GitHub Pages)에 올려 두면 자동으로 동작해요. (https 주소에서만)
   - 지도 조각(타일)과 라이브러리(Leaflet 등): 한 번 받으면 기기에 저장해 다음부터는 인터넷을 쓰지 않음
   - 앱 화면(index.html): 항상 최신 버전을 먼저 받고, 인터넷이 안 되면 저장된 화면을 보여줌
   - GitHub 저장, 장소 검색, 경로 계산 같은 데이터 요청은 저장하지 않고 그대로 보냄 */
const STATIC = 'trip-static-v1';
const TILES = 'trip-tiles-v1';
const PAGES = 'trip-pages-v1';
const MAX_TILES = 4000; // 지도 조각 최대 보관 개수 (약 60~120MB). 넘으면 오래된 것부터 지움

const LIBS = [ // 설치할 때 미리 저장 (index.html의 주소와 같아야 함)
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(STATIC).then(c => Promise.all(LIBS.map(u =>
    fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})))));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = [STATIC, TILES, PAGES];
  for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

const isTile = u => /(^|\.)tile\.openstreetmap\.(org|fr|de)$/.test(u.hostname) || u.hostname === 'server.arcgisonline.com';
const isLib = u => u.hostname === 'unpkg.com' || u.hostname === 'cdnjs.cloudflare.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (isTile(u)) e.respondWith(cacheFirst(req, TILES));
  else if (isLib(u)) e.respondWith(cacheFirst(req, STATIC));
  else if (u.origin === self.location.origin) e.respondWith(networkFirst(req));
  // 그 밖의 요청(GitHub API, 검색, 위키백과 등)은 손대지 않음
});

let puts = 0;
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  // 정상 응답만 저장 (막힘 안내 그림·오류는 저장하지 않음, 용량이 큰 불투명 응답도 제외)
  if (res.ok && (res.type === 'cors' || res.type === 'basic')) {
    cache.put(req, res.clone()).catch(() => {});
    if (name === TILES && ++puts % 100 === 0) trim(cache);
  }
  return res;
}
async function trim(cache) {
  try {
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(k);
  } catch (e) {}
}
async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
