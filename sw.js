/* يخزن ملفات المنيو حتى يفتح بسرعة ويشتغل حتى لو النت ضعيف */
const V = "fm-v1";
const SHELL = ["./", "index.html", "assets/menu.css", "assets/config.js", "assets/common.js", "assets/menu.js", "data/menu.json", "img/logo.webp", "img/icon-192.png",
  "img/kentucky.webp", "img/pizza.webp", "img/saj.webp", "img/burger.webp", "img/sandwich.webp", "img/dishes.webp", "img/entrees.webp", "img/drinks.webp", "img/arakil.webp"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (!u.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  if (/\/k[0-9a-f]{10}\//.test(u.pathname)) return; // لوحة التحكم ما تتخزن
  // الشبكة أولاً، وإذا ماكو نت نستخدم النسخة المخزنة
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
