/* أدوات مشتركة بين صفحة المنيو ولوحة التحكم */
(function () {
  const C = window.FM_CONFIG;
  const FM = (window.FM = {});
  FM.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  FM.fmt = n => Number(n).toLocaleString("en-US");
  FM.clone = o => JSON.parse(JSON.stringify(o));
  FM.norm = s => String(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/گ/g, "ك").toLowerCase();
  FM.digits = v => String(v).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/\D/g, "");
  FM.MAXP = 1000000;
  FM.safeUrl = u => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
  FM.safeImg = u => {
    u = String(u || "").trim();
    if (/^img\/[a-z0-9_-]+\.(webp|jpg|png)$/i.test(u)) return u;
    if (u.startsWith(C.supabaseUrl + "/storage/v1/object/public/fm-images/") && FM.safeUrl(u)) return u;
    return "";
  };
  FM.waLink = n => {
    let d = String(n || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = "964" + d.slice(1);
    return "https://wa.me/" + d;
  };
  FM.DAYS = { ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"], en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };
  FM.FONTS = ["Tajawal", "Cairo", "Almarai", "IBM Plex Sans Arabic", "Noto Kufi Arabic"];
  const loaded = new Set(["Tajawal"]);
  FM.loadFont = f => {
    if (loaded.has(f) || !FM.FONTS.includes(f)) return;
    loaded.add(f);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + f.replace(/ /g, "+") + ":wght@400;500;700;800&display=swap";
    document.head.appendChild(l);
  };
  FM.applyLook = L => {
    if (!L) return;
    FM.loadFont(L.font);
    const r = document.documentElement.style;
    if (/^#[0-9a-f]{6}$/i.test(L.brand)) r.setProperty("--brand", L.brand);
    if (/^#[0-9a-f]{6}$/i.test(L.brand2)) r.setProperty("--brand2", L.brand2);
    if (FM.FONTS.includes(L.font)) r.setProperty("--body", `"${L.font}",system-ui,"Segoe UI",Tahoma,sans-serif`);
  };

  /* الوقت بتوقيت بغداد */
  FM.nowB = () => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Baghdad", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const g = t => (p.find(x => x.type === t) || {}).value;
    return { d: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")), m: (+g("hour") % 24) * 60 + +g("minute") };
  };
  FM.toMin = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  FM.fmtT = (min, lang) => {
    min = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(min / 60), m = min % 60;
    const suf = lang === "en" ? (h < 12 ? "AM" : "PM") : (h < 12 ? "ص" : "م");
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suf}`;
  };
  FM.status = (H, lang) => {
    const en = lang === "en", D = FM.DAYS[en ? "en" : "ar"];
    const { d, m } = FM.nowB(), t = H[d], y = H[(d + 6) % 7];
    let close = null, day = d;
    if (!y.off) { const o = FM.toMin(y.o), c = FM.toMin(y.c); if (c <= o && m < c) { close = c; day = (d + 6) % 7; } }
    if (close === null && !t.off) { const o = FM.toMin(t.o), c = FM.toMin(t.c); if (c > o) { if (m >= o && m < c) close = c; } else if (m >= o) close = c + 1440; }
    if (close !== null) {
      const left = close - m;
      return left <= 60
        ? { k: "warn", t: en ? `Closes in ${left} min` : `يسد بعد ${left} دقيقة`, s: "", day }
        : { k: "ok", t: en ? "Open now" : "مفتوح الآن", s: (en ? "until " : "لحد ") + FM.fmtT(close, lang), day };
    }
    const closed = en ? "Closed now" : "مسدود هسه";
    if (!t.off && m < FM.toMin(t.o)) return { k: "bad", t: closed, s: (en ? "Opens today " : "يفتح اليوم ") + FM.fmtT(FM.toMin(t.o), lang), day };
    for (let i = 1; i <= 7; i++) {
      const n = H[(d + i) % 7];
      if (!n.off) return { k: "bad", t: closed, s: (en ? (i === 1 ? "Opens tomorrow " : "Opens " + D[(d + i) % 7] + " ") : (i === 1 ? "يفتح باچر " : "يفتح يوم " + D[(d + i) % 7] + " ")) + FM.fmtT(FM.toMin(n.o), lang), day };
    }
    return { k: "bad", t: closed, s: "", day };
  };
  FM.hoursTxt = (h, lang) => (h.off ? (lang === "en" ? "Closed" : "عطلة") : `${FM.fmtT(FM.toMin(h.o), lang)} – ${FM.fmtT(FM.toMin(h.c), lang)}`);
  FM.dateTxt = (ts, lang) => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-IQ-u-nu-latn", { timeZone: "Asia/Baghdad", day: "numeric", month: "long", year: "numeric" }).format(new Date(ts));
  FM.dateTimeTxt = ts => new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { timeZone: "Asia/Baghdad", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(ts));

  FM.I = {
    chicken: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5a5 5 0 0 1 0 7.1l-3.4 3.4-3.6-3.6 3.4-3.4a5 5 0 0 1 3.6-3.5z"/><path d="M8.5 10.4 5.3 13.6a2 2 0 1 1-2.2 3.3 2 2 0 1 1 3.3-2.2l3.2-3.2"/></svg>',
    pizza: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21 3 6a15 15 0 0 1 18 0z"/><path d="M4.6 8.7a12 12 0 0 1 14.8 0"/><circle cx="10" cy="11" r="1.2" fill="currentColor"/><circle cx="14" cy="12.5" r="1.2" fill="currentColor"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/></svg>',
    plate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.5"/><path d="M2 5v5M2 10v9M22 5c-1.5 1-1.5 4 0 5v9"/></svg>',
    wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5"/><path d="M3.5 14.5 14.5 3.5c2 0 6 4 6 6L9.5 20.5c-2 0-6-4-6-6z"/></svg>',
    burger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 6 0 0 1 16 0z"/><path d="M3 13.5h18"/><path d="M4 17h16a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/></svg>',
    salad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M8 12c0-3 2-5 4-6M13 12c0-2 1.5-4 4-4.5"/></svg>',
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1.5 13h-9z"/><path d="M5 8h14M13 8l2-5h3"/></svg>',
    smoke: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M10 6h4l-.5 4h-3z"/><path d="M8 21a4 4 0 0 1 8 0z"/><path d="M12 10v7M13.5 13c2 0 3 1 4 3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>'
  };

  /* قراءة المنيو من Supabase (عام، قراءة فقط) */
  FM.fetchMenu = async () => {
    const r = await fetch(`${C.supabaseUrl}/rest/v1/fm_menu?id=eq.1&select=data,updated_at`, {
      headers: { apikey: C.supabaseKey }, cache: "no-store"
    });
    if (!r.ok) throw new Error("menu " + r.status);
    const rows = await r.json();
    return rows[0] || null;
  };
})();
