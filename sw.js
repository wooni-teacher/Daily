// 우리 하루 — 앱 화면을 기기에 저장해 두고, 인터넷이 느리거나 끊겨도 화면이 열리게 합니다.
// 일정 데이터는 Firebase가 따로 동기화하므로 여기서는 앱 파일만 다룹니다.
const CACHE = "uri-haru-v10";
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

// ---- 휴대폰 알림 ----
// GitHub Actions의 알림 스크립트가 Firebase Cloud Messaging으로 보낸 알림을 화면에 띄움
self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { title: "우리 하루", body: e.data?.text() || "" } }; }
  const d = p.data || p.notification || {};
  e.waitUntil(self.registration.showNotification(d.title || "우리 하루", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow(url);
  }));
});
