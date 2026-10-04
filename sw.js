// 우리 하루 — 앱 화면을 기기에 저장해 두고, 인터넷이 느리거나 끊겨도 화면이 열리게 합니다.
// 일정 데이터는 Firebase가 따로 동기화하므로 여기서는 앱 파일만 다룹니다.
const CACHE = "uri-haru-v6";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // Firebase·폰트 요청은 건드리지 않음
  // 새 버전을 먼저 받아오고, 실패하면 저장해 둔 화면을 보여줌
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
