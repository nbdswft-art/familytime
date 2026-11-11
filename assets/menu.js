/* صفحة المنيو للزبائن */
(function () {
  const C = window.FM_CONFIG, F = window.FM, I = F.I, $ = id => document.getElementById(id);
  let M = null, lang = "ar", obs = null, secObs = null;
  try { lang = localStorage.getItem("fm-lang") === "en" ? "en" : "ar"; } catch (e) {}

  const T = {
    ar: { pre: "مطعم وحدائق", today: "الدوام اليوم", wifi: "واي فاي", nopass: "بدون رمز", tapcopy: "اضغط حتى تنسخ الرمز", loc: "موقعنا", info: "معلوماتنا",
      hours: "أوقات الدوام", todayTag: " (اليوم)", wifiH: "الواي فاي", net: "الشبكة", copyPass: "نسخ الرمز", wa: "واتساب", msg: "راسلنا", order: "للطلب والحجز",
      copyNum: "نسخ الرقم", addr: "العنوان", map: "افتح الخريطة", upd: "آخر تحديث للأسعار: ", search: "ابحث عن أكلة… مثلاً: زنجر", none: "ما لكينا هالأكلة، جرب اسم ثاني",
      feat: "مميز", na: "غير متوفر اليوم", off: "خصم", cur: "د.ع", copied: "تم النسخ", share: "شارك المنيو", other: "English", welcome: "أهلاً وسهلاً بيكم", cats: "أقسام المنيو", close: "سكّر" },
    en: { pre: "Restaurant & Gardens", today: "Today's hours", wifi: "Wi-Fi", nopass: "No password", tapcopy: "Tap to copy password", loc: "Find us", info: "About us",
      hours: "Opening hours", todayTag: " (today)", wifiH: "Wi-Fi", net: "Network", copyPass: "Copy password", wa: "WhatsApp", msg: "Message us", order: "Orders & bookings",
      copyNum: "Copy number", addr: "Address", map: "Open map", upd: "Prices updated: ", search: "Search the menu… e.g. Zinger", none: "Nothing found, try another name",
      feat: "Featured", na: "Not available today", off: "off", cur: "IQD", copied: "Copied", share: "Share the menu", other: "عربي", welcome: "Welcome", cats: "Menu sections", close: "Close" }
  };
  const t = k => T[lang][k];
  const N = (ar, en) => (lang === "en" && en ? en : ar);
  const TC = s => String(s || "").toLowerCase().replace(/(^|[\s&/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const SN = s => (lang === "en" ? TC(s.en) : s.ar);

  /* ---------- الإحصائيات (بدون أي معلومات شخصية) ---------- */
  const track = (() => {
    let vid = "", isNew = false, tbl = "";
    try {
      vid = localStorage.getItem("fm-vid") || "";
      if (!vid) { vid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).slice(0, 36); localStorage.setItem("fm-vid", vid); isNew = true; }
    } catch (e) { vid = "anon-" + Date.now(); isNew = true; }
    const tp = new URLSearchParams(location.search).get("t");
    if (tp && /^[0-9a-z-]{1,12}$/i.test(tp)) { tbl = tp; try { sessionStorage.setItem("fm-tbl", tp); } catch (e) {} }
    else { try { tbl = sessionStorage.getItem("fm-tbl") || ""; } catch (e) {} }
    const ua = navigator.userAgent;
    const device = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Mobi/.test(ua) ? "mobile" : "desktop";
    const sent = new Set();
    function send(kind, ref, once) {
      if (navigator.webdriver) return;
      const key = kind + ":" + (ref || "");
      if (once && sent.has(key)) return;
      sent.add(key);
      const body = { vid, kind, ref: ref ? String(ref).slice(0, 60) : null, tbl: tbl || null, device };
      if (kind === "visit") body.is_new = isNew;
      try {
        fetch(`${C.supabaseUrl}/rest/v1/fm_events`, { method: "POST", keepalive: true,
          headers: { apikey: C.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) }).catch(() => {});
      } catch (e) {}
    }
    let visited = false;
    try { visited = sessionStorage.getItem("fm-visit") === "1"; sessionStorage.setItem("fm-visit", "1"); } catch (e) {}
    if (!visited) send("visit");
    return send;
  })();

  /* ---------- الرسم ---------- */
  function renderStatic() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    $("lang").textContent = t("other");
    $("q").placeholder = t("search");
    $("q").setAttribute("aria-label", t("search"));
    document.querySelector("nav.cats").setAttribute("aria-label", t("cats"));
    $("share").textContent = t("share");
    $("lb-x").setAttribute("aria-label", t("close"));
  }
  function renderStatus() {
    if (!M) return;
    const s = F.status(M.info.hours, lang), el = $("status");
    el.className = "status " + s.k;
    el.querySelector("b").textContent = s.t;
    el.querySelector("small").textContent = s.s;
    const th = $("today-h");
    if (th) th.textContent = F.hoursTxt(M.info.hours[s.day], lang);
    return s;
  }
  function renderTop() {
    const inf = M.info;
    $("title").innerHTML = lang === "en"
      ? `<span class="accent">${F.esc(inf.name_en || "Family Time")}</span> ${F.esc(t("pre"))}`
      : `${F.esc(t("pre"))} <span class="accent">${F.esc(inf.name)}</span>`;
    $("tagline").textContent = N(inf.tagline, inf.tagline_en);
    const s = renderStatus(), act = s.day, wa = F.waLink(inf.wa), maps = F.safeUrl(inf.maps), addr = N(inf.address, inf.address_en);
    const D = F.DAYS[lang];
    let q = `<a class="q" href="#info"><span>${I.clock}${t("today")}</span><b id="today-h">${F.hoursTxt(inf.hours[act], lang)}</b></a>`;
    if (inf.wifi.ssid) q += `<button class="q" type="button" data-copy="${F.esc(inf.wifi.pass)}" data-ev="wifi"><span>${I.wifi}${t("wifi")}: ${F.esc(inf.wifi.ssid)}</span><b dir="ltr">${F.esc(inf.wifi.pass || t("nopass"))}</b><em>${inf.wifi.pass ? t("tapcopy") : ""}</em></button>`;
    q += `<a class="q" href="#info"><span>${I.pin}${t("loc")}</span><b>${F.esc(addr)}</b></a>`;
    $("quick").innerHTML = q;
    let h = `<h3>${t("info")}</h3><div><h4>${t("hours")}</h4><div class="hours">`;
    for (let i = 0; i < 7; i++) { const k = (act + i) % 7; h += `<div class="hrow${i === 0 ? " today" : ""}"><span>${D[k]}${i === 0 ? t("todayTag") : ""}</span><span>${F.hoursTxt(inf.hours[k], lang)}</span></div>`; }
    h += `</div></div>`;
    if (inf.wifi.ssid) h += `<div><h4>${t("wifiH")}</h4><div class="box"><div><span class="lbl">${t("net")}: ${F.esc(inf.wifi.ssid)}</span><span class="val">${F.esc(inf.wifi.pass || t("nopass"))}</span></div>${inf.wifi.pass ? `<button class="copy" type="button" data-copy="${F.esc(inf.wifi.pass)}" data-ev="wifi">${t("copyPass")}</button>` : ""}</div></div>`;
    if (wa) h += `<div><h4>${t("wa")}</h4><div class="box"><span class="val">${F.esc(inf.wa)}</span><a class="wa" href="${wa}" target="_blank" rel="noopener" data-ev="wa">${I.wa}${t("msg")}</a></div></div>`;
    h += `<div><h4>${t("order")}</h4><div style="display:grid;gap:8px">${inf.phones.filter(Boolean).map(p => { const n = p.replace(/[^\d+]/g, ""); return `<div class="box"><a class="num" href="tel:${F.esc(n)}" data-ev="call">${F.esc(p)}</a><button class="copy" type="button" data-copy="${F.esc(n)}" data-ev="call">${t("copyNum")}</button></div>`; }).join("")}</div></div>`;
    h += `<div><h4>${t("addr")}</h4><div class="box"><p class="addr">${F.esc(addr)}</p>${maps ? `<a class="maps" href="${F.esc(maps)}" target="_blank" rel="noopener" data-ev="maps">${t("map")}</a>` : ""}</div></div>`;
    $("info").innerHTML = h;
    const wb = $("wa-btn");
    wb.hidden = !wa;
    if (wa) { wb.href = wa; wb.dataset.ev = "wa"; wb.innerHTML = I.wa + `<span>${t("wa")}</span>`; }
    $("updated").textContent = t("upd") + F.dateTxt(M.updated || Date.now(), lang);
    $("share").hidden = !navigator.share;
  }
  const chips = $("chips");
  function renderChips() {
    chips.innerHTML = M.sections.map(s => `<a class="chip${s.hot ? " hot" : ""}" href="#${F.esc(s.id)}" data-id="${F.esc(s.id)}">${F.esc(SN(s))}</a>`).join("");
  }
  function itemHTML(it, si, gi, ii) {
    const disc = it.o && it.o > it.p, pct = disc ? Math.round((1 - it.p / it.o) * 100) : 0, img = F.safeImg(it.img);
    const pill = it.x ? `<span class="pill na">${t("na")}</span>` : disc ? `<span class="pill off">${lang === "en" ? pct + "% " + t("off") : t("off") + " " + pct + "%"}</span>` : "";
    return `<li class="${it.x ? "na " : ""}${img ? "has-img" : ""}" data-k="${si}-${gi}-${ii}"${img ? ' tabindex="0" role="button"' : ""}><div class="it-l">${img ? `<img class="thumb" src="${F.esc(img)}" alt="" loading="lazy" width="52" height="52">` : ""}<div class="nm"><span class="name">${F.esc(N(it.n, it.e))}</span>${pill}</div></div><div class="pr">${disc && !it.x ? `<s class="old">${F.fmt(it.o)}</s>` : ""}<span class="price${disc && !it.x ? " deal" : ""}">${F.fmt(it.p)}<small>${t("cur")}</small></span></div></li>`;
  }
  function renderMenu() {
    const q = F.norm($("q").value.trim()), ok = s => !q || F.norm(s).includes(q);
    let html = "";
    M.sections.forEach((s, si) => {
      let body = "";
      s.groups.forEach((g, gi) => {
        const r = g.items.map((it, ii) => (ok(it.n + " " + (it.e || "") + " " + g.g) ? itemHTML(it, si, gi, ii) : "")).filter(Boolean);
        if (r.length) body += (g.g ? `<span class="sub">${F.esc(N(g.g, g.e))}</span>` : "") + `<ul>${r.join("")}</ul>`;
      });
      if (!body) return;
      const head = `<div class="sec-head"><span class="ico">${I[s.ico] || I.plate}</span><div class="ttl"><h2>${F.esc(SN(s))}</h2>${lang === "ar" ? `<div class="en" dir="ltr">${F.esc(s.en)}</div>` : ""}</div>${s.hot ? `<span class="pick">${t("feat")}</span>` : ""}</div>`;
      const img = F.safeImg(s.img);
      const bg = img ? `background-image:linear-gradient(to top,rgba(20,10,5,.88) 0%,rgba(20,10,5,.35) 60%,rgba(20,10,5,.1) 100%),url('${img}')` : "background-image:linear-gradient(135deg,var(--brand),var(--brand2))";
      html += `<section class="sec${s.hot ? " featured" : ""}" id="${F.esc(s.id)}" data-sid="${F.esc(s.id)}"><div class="banner" style="${bg}">${head}</div><div class="items">${body}</div></section>`;
    });
    $("menu").innerHTML = html || `<p class="empty">${t("none")}</p>`;
    watch();
  }
  function setOn(id) {
    chips.querySelectorAll(".chip").forEach(c => {
      const on = c.dataset.id === id;
      c.classList.toggle("on", on);
      if (on) { const cr = chips.getBoundingClientRect(), r = c.getBoundingClientRect(); chips.scrollBy({ left: r.left + r.width / 2 - (cr.left + cr.width / 2) }); }
    });
  }
  function watch() {
    if (!("IntersectionObserver" in window)) return;
    if (obs) obs.disconnect();
    if (secObs) secObs.disconnect();
    obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setOn(e.target.id); }), { rootMargin: "-80px 0px -65% 0px" });
    secObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) track("section", e.target.dataset.sid, true); }), { threshold: 0.35 });
    document.querySelectorAll("main section").forEach(s => { obs.observe(s); secObs.observe(s); });
  }
  function renderAll() {
    F.applyLook(M.look);
    renderStatic(); renderTop(); renderChips(); renderMenu();
  }

  /* ---------- التحميل: نسخة محفوظة بالجهاز ← النسخة الحية ---------- */
  function valid(d) { return d && Array.isArray(d.sections) && d.info && Array.isArray(d.info.hours) && d.info.hours.length === 7; }
  function use(d) { if (!valid(d)) return false; M = d; renderAll(); return true; }
  let shown = false;
  try { const c = JSON.parse(localStorage.getItem("fm-menu") || "null"); if (use(c)) shown = true; } catch (e) {}
  if (!shown) renderStatic();
  (async () => {
    let d = null;
    try { const row = await F.fetchMenu(); if (row && valid(row.data)) d = row.data; } catch (e) {}
    if (!d) { try { const r = await fetch("data/menu.json", { cache: "no-cache" }); if (r.ok) d = await r.json(); } catch (e) {} }
    if (!d) { if (!shown) $("menu").innerHTML = `<p class="empty">${lang === "en" ? "Couldn't load the menu. Check your connection." : "ما گدرنا نحمّل المنيو، تأكد من النت."}</p>`; return; }
    if (!M || JSON.stringify(d) !== JSON.stringify(M)) use(d);
    try { localStorage.setItem("fm-menu", JSON.stringify(d)); } catch (e) {}
    if (!shown) splash();
  })();
  setInterval(renderStatus, 60000);

  /* ---------- التفاعل ---------- */
  let st;
  $("q").addEventListener("input", () => {
    if (!M) return;
    renderMenu();
    clearTimeout(st);
    const v = $("q").value.trim();
    if (v.length >= 2) st = setTimeout(() => track("search", v, true), 1500);
  });
  $("lang").addEventListener("click", () => {
    lang = lang === "ar" ? "en" : "ar";
    try { localStorage.setItem("fm-lang", lang); } catch (e) {}
    track("lang", lang, true);
    if (M) renderAll(); else renderStatic();
  });
  $("share").addEventListener("click", () => {
    navigator.share({ title: document.title, url: C.siteUrl }).then(() => track("share")).catch(() => {});
  });
  document.addEventListener("click", e => {
    const ev = e.target.closest("[data-ev]");
    if (ev) track(ev.dataset.ev);
    const b = e.target.closest("[data-copy]");
    if (b && b.dataset.copy) {
      const lbl = b.classList.contains("q") ? b.querySelector("em") : b, old = lbl.textContent;
      const done = () => { lbl.textContent = t("copied"); setTimeout(() => (lbl.textContent = old), 1500); };
      try { navigator.clipboard.writeText(b.dataset.copy).then(done).catch(() => {}); } catch (err) {}
    }
    const li = e.target.closest("li.has-img");
    if (li) openItem(li);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeLb();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("li.has-img")) { e.preventDefault(); openItem(e.target); }
  });
  function openItem(li) {
    const [si, gi, ii] = li.dataset.k.split("-").map(Number), s = M.sections[si], it = s.groups[gi].items[ii];
    $("lb-img").src = F.safeImg(it.img);
    $("lb-n").textContent = N(it.n, it.e);
    $("lb-p").innerHTML = `<span class="price">${F.fmt(it.p)}<small>${t("cur")}</small></span>`;
    $("lb").hidden = false;
    track("item", s.id + ":" + it.n);
  }
  function closeLb() { $("lb").hidden = true; }
  $("lb").addEventListener("click", e => { if (e.target.id === "lb" || e.target.id === "lb-x") closeLb(); });

  /* ---------- صفحة الترحيب ---------- */
  function splash() {
    if (!M || !M.look || !M.look.splash) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try { if (sessionStorage.getItem("fm-splash")) return; sessionStorage.setItem("fm-splash", "1"); } catch (e) {}
    const d = document.createElement("div");
    d.className = "splash"; d.setAttribute("aria-hidden", "true");
    d.innerHTML = `<img src="img/logo.webp" alt=""><b>${F.esc(N(M.info.name, M.info.name_en))}</b><span>${t("welcome")}</span>`;
    document.body.appendChild(d);
    const go = () => { d.classList.add("out"); setTimeout(() => d.remove(), 350); };
    d.addEventListener("click", go);
    setTimeout(go, 900);
  }
  if (shown) splash();

  /* ---------- يشتغل كتطبيق ---------- */
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  addEventListener("appinstalled", () => track("install"));
})();
