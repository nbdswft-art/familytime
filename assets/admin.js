/* لوحة تحكم فاملي تايم. كلمة السر يتحقق منها سيرفر Supabase، وصلاحيات الكتابة محمية بـ RLS. */
(function () {
  const C = window.FM_CONFIG, F = window.FM, I = F.I, $ = id => document.getElementById(id);
  if (!window.supabase) { $("login-msg").textContent = "ما گدرنا نحمّل اللوحة، تأكد من النت وحدّث الصفحة."; return; }
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "fm-admin-auth" } });
  const ICONS = { chicken: "دجاج", pizza: "بيتزا", wrap: "صاج/سندويش", burger: "برگر", plate: "طبق", salad: "مقبلات", cup: "مشروب", smoke: "أركيلة" };
  const PRESETS = [{ n: "فاملي تايم", a: "#e4421c", b: "#b8862b" }, { n: "عنابي", a: "#9b2335", b: "#b8862b" }, { n: "زيتوني", a: "#5f7a2e", b: "#b08a3e" }, { n: "بحري", a: "#1f6f8b", b: "#c28f3a" }, { n: "برتقالي", a: "#e07a1f", b: "#8a5a2b" }];
  const ACT = { wa: "ضغطوا واتساب", call: "اتصلوا أو نسخوا الرقم", maps: "فتحوا الخريطة", wifi: "نسخوا رمز الواي فاي", share: "شاركوا المنيو", lang: "غيّروا اللغة", install: "ضافوه كتطبيق" };
  const DEV = { ios: "آيفون", android: "أندرويد", mobile: "موبايل ثاني", desktop: "كمبيوتر", other: "غير معروف" };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12);

  let SAVED = null, SAVED_AT = null, M = null, me = { id: null, name: "مشرف" };
  let tab = "items", openSecs = new Set(), sorts = [], saving = false, cancelArmed = 0, statDays = 30, qrCount = 10;
  const msgEl = $("msg"), saveBtn = $("save"), panel = $("panel");
  const setMsg = t => (msgEl.textContent = t);

  /* ---------- الدخول ---------- */
  const pinToPw = pin => "fm-" + pin + "-menu";
  const LOCK_KEY = "fm-lock";
  const lockInfo = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); } catch (e) { return {}; } };
  const setLock = o => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(o)); } catch (e) {} };
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const L = lockInfo(), lm = $("login-msg");
    if (L.until && Date.now() < L.until) { lm.textContent = `محاولات كثيرة غلط. جرب بعد ${Math.ceil((L.until - Date.now()) / 60000)} دقيقة.`; return; }
    $("login-btn").disabled = true; lm.textContent = "جاري الدخول…";
    const pin = F.digits($("password").value);
    const { error } = await sb.auth.signInWithPassword({ email: C.adminEmail, password: pinToPw(pin) });
    $("login-btn").disabled = false;
    if (error) {
      const fails = (L.fails || 0) + 1;
      setLock(fails >= 5 ? { fails: 0, until: Date.now() + 15 * 60000 } : { fails });
      lm.textContent = fails >= 5 ? "انقفل الدخول 15 دقيقة بسبب المحاولات الغلط." : "الرمز غلط.";
      return;
    }
    setLock({});
    $("password").value = "";
    await enter();
  });
  async function enter() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showLogin(); return; }
    const { data: ok, error } = await sb.rpc("fm_is_admin");
    if (error || !ok) {
      await sb.auth.signOut();
      showLogin(error ? "ما گدرنا نتأكد من الصلاحية. تأكد إن ملف setup.sql انشغّل بـ Supabase." : "هذا الحساب ما عنده صلاحية على لوحة المنيو.");
      return;
    }
    me.id = session.user.id;
    const { data: a } = await sb.from("fm_admins").select("name").eq("user_id", me.id).maybeSingle();
    if (a && a.name) me.name = a.name;
    await loadMenu();
    $("login").hidden = true; $("app").hidden = false;
    drawPanel(); refreshDirty();
  }
  function showLogin(m) { $("app").hidden = true; $("login").hidden = false; $("login-msg").textContent = m || ""; }
  $("logout").addEventListener("click", async () => {
    if (isDirty() && !confirmStep($("logout"), "عندك تغييرات ما محفوظة، اضغط مرة ثانية للخروج")) return;
    await sb.auth.signOut(); location.reload();
  });
  // خروج تلقائي بعد 30 دقيقة بدون استخدام
  let lastAct = Date.now();
  ["click", "keydown", "input", "touchstart"].forEach(ev => addEventListener(ev, () => (lastAct = Date.now()), { passive: true }));
  setInterval(async () => { if (!$("app").hidden && !isDirty() && Date.now() - lastAct > 30 * 60000) { await sb.auth.signOut(); location.reload(); } }, 60000);
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && !$("app").hidden) showLogin("انتهت جلسة الدخول، ادخل مرة ثانية."); });

  /* ---------- البيانات ---------- */
  function normalize(d) {
    d.info.wa = d.info.wa || ""; d.info.maps = d.info.maps || ""; d.info.wifi = d.info.wifi || { ssid: "", pass: "" };
    d.look = d.look || { brand: "#e4421c", brand2: "#b8862b", font: "Tajawal", splash: true };
    d.sections.forEach(s => s.groups.forEach(g => { g.e = g.e || ""; g.items.forEach(it => { if (!it.k) it.k = uid(); }); }));
    return d;
  }
  async function loadMenu() {
    const { data: row, error } = await sb.from("fm_menu").select("data,updated_at").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (row) { SAVED = normalize(row.data); SAVED_AT = row.updated_at; }
    else {
      const seed = normalize(await (await fetch("../data/menu.json", { cache: "no-cache" })).json());
      const { data: ins, error: e2 } = await sb.from("fm_menu").insert({ id: 1, data: seed }).select("updated_at").single();
      if (e2) throw e2;
      SAVED = seed; SAVED_AT = ins.updated_at;
    }
    M = F.clone(SAVED);
    F.applyLook(M.look);
  }
  const strip = o => { const c = F.clone(o); delete c.updated; return JSON.stringify(c); };
  const isDirty = () => !!M && strip(M) !== strip(SAVED);
  function refreshDirty() { const d = isDirty(); saveBtn.disabled = !d || saving; if (!saving) setMsg(d ? "عندك تغييرات ما محفوظة. الزبائن ما يشوفوها إلا بعد الحفظ." : "كل شي محفوظ"); }
  function changed() { refreshDirty(); F.applyLook(M.look); }
  function confirmStep(btn, text) {
    if (btn._armed && Date.now() - btn._armed < 4000) { btn._armed = 0; btn.textContent = btn._orig; return true; }
    btn._orig = btn._orig || btn.textContent; btn._armed = Date.now(); btn.textContent = "متأكد؟"; setMsg(text);
    setTimeout(() => { if (btn.isConnected) btn.textContent = btn._orig; }, 4000);
    return false;
  }
  addEventListener("beforeunload", e => { if (!saving && isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  $("cancel").addEventListener("click", () => {
    if (!isDirty()) { setMsg("ماكو تغييرات حتى ترجعها"); return; }
    if (!confirmStep($("cancel"), "التراجع يمسح كل التغييرات اللي ما محفوظة. اضغط مرة ثانية للتأكيد.")) return;
    M = F.clone(SAVED); changed(); drawPanel(); setMsg("رجّعت كل شي مثل ما كان");
  });
  $("tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab"); if (!b) return;
    tab = b.dataset.t;
    document.querySelectorAll(".tab").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
    drawPanel(); $("sh-body").scrollTop = 0;
  });
  function drawPanel() { sorts.forEach(s => s.destroy()); sorts = []; ({ items: pItems, info: pInfo, look: pLook, stats: pStats, qr: pQr, log: pLog, backup: pBackup })[tab](); }

  /* ---------- مكتبات تنزل وقت الحاجة ---------- */
  const libs = {};
  function lib(name, src, sri) {
    if (libs[name]) return libs[name];
    return (libs[name] = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.integrity = sri; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
      s.onload = res; s.onerror = () => { libs[name] = null; rej(); }; document.head.appendChild(s);
    }));
  }
  const loadSortable = () => (window.Sortable ? Promise.resolve() : lib("sortable", "https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js", "sha384-BSxuMLxX+FCbTdYec3TbXlnMGEEM2QXTFdtDaveen71o+jswm2J36+xFqp8k4VHM"));
  const loadQr = () => (window.qrcode ? Promise.resolve() : lib("qr", "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js", "sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1"));

  /* ---------- الأصناف ---------- */
  function pItems() {
    let h = `<p class="hint">اسحب من ${I.grip.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} حتى تغيّر الترتيب. اضغط على مربع الصورة حتى ترفع صورة للصنف. "السعر قبل الخصم" اكتبه بس إذا تريد يطلع عرض.</p><div id="a-secs" style="display:grid;gap:10px">`;
    M.sections.forEach((s, si) => {
      const n = s.groups.reduce((a, g) => a + g.items.length, 0), na = s.groups.reduce((a, g) => a + g.items.filter(i => i.x).length, 0), open = openSecs.has(s.id);
      h += `<div class="a-sec${open ? " open" : ""}"><div class="a-sh"><span class="handle sh" aria-label="اسحب لترتيب القسم">${I.grip}</span><button class="a-tg" type="button" data-tg="${F.esc(s.id)}"><span>${F.esc(s.ar)}</span><small>${n} صنف${na ? ` · ${na} غير متوفر` : ""} ${I.chev}</small></button></div>`;
      if (open) {
        h += `<div class="a-in"><div class="a-meta">
          <label class="fld">اسم القسم<input data-s="${si}" data-k="sar" value="${F.esc(s.ar)}"></label>
          <label class="fld">الاسم بالإنكليزي<input data-s="${si}" data-k="sen" value="${F.esc(s.en)}" dir="ltr"></label>
          <label class="fld">الأيقونة<select data-s="${si}" data-k="ico">${Object.entries(ICONS).map(([k, v]) => `<option value="${k}"${s.ico === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="sw" style="grid-area:auto"><input type="checkbox" data-s="${si}" data-k="hot"${s.hot ? " checked" : ""}>قسم مميز</label>
          <div class="row" style="gap:8px"><label class="btn ghost sm" style="position:relative">صورة الغلاف<input type="file" accept="image/*" data-s="${si}" data-k="simg" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%"></label><button class="del" type="button" data-delsec="${si}">حذف القسم</button></div>
        </div>`;
        s.groups.forEach((g, gi) => {
          h += `<div class="a-g">${s.groups.length > 1 || g.g ? `<span style="display:flex;gap:6px;flex-wrap:wrap"><input class="inp sm" data-g="${si}-${gi}" data-k="gar" value="${F.esc(g.g)}" placeholder="اسم المجموعة" style="width:150px"><input class="inp sm" data-g="${si}-${gi}" data-k="gen" value="${F.esc(g.e || "")}" placeholder="English" dir="ltr" style="width:130px"></span>` : "<span></span>"}<button class="btn ghost sm" type="button" data-add="${si}-${gi}">+ صنف جديد</button></div><ul class="a-items" data-si="${si}" data-gi="${gi}">`;
          g.items.forEach((it, ii) => {
            const p = `${si}-${gi}-${ii}`, img = F.safeImg(it.img);
            h += `<li><span class="handle ih" aria-label="اسحب">${I.grip}</span>
              <label class="a-img${img ? " has" : ""}" ${img ? `style="background-image:url('${F.esc(img)}')"` : ""} title="صورة الصنف">${img ? "" : "+ صورة"}<input type="file" accept="image/*" data-p="${p}" data-k="img" aria-label="صورة ${F.esc(it.n)}"></label>
              <div class="a-n"><input class="inp sm" data-p="${p}" data-k="n" value="${F.esc(it.n)}" aria-label="الاسم"><input class="inp sm" data-p="${p}" data-k="e" value="${F.esc(it.e || "")}" placeholder="English name" dir="ltr" aria-label="الاسم بالإنكليزي"></div>
              <label class="sw"><input type="checkbox" data-p="${p}" data-k="av"${it.x ? "" : " checked"}>متوفر</label>
              <div class="a-p"><label class="fld">السعر (د.ع)<input class="num${it.p > 0 && it.p <= F.MAXP ? "" : " bad-in"}" id="p-${p}" inputmode="numeric" data-p="${p}" data-k="p" value="${it.p || ""}"></label><label class="fld">السعر قبل الخصم<input class="num" id="o-${p}" inputmode="numeric" data-p="${p}" data-k="o" value="${it.o || ""}" placeholder="بدون خصم"></label>
              <div style="display:flex;gap:6px">${img ? `<button class="del" type="button" data-rmimg="${p}">شيل الصورة</button>` : ""}<button class="del" type="button" data-del="${p}">حذف</button></div></div></li>`;
          });
          h += `</ul>`;
        });
        h += `</div>`;
      }
      h += `</div>`;
    });
    h += `</div><button class="btn ghost" type="button" id="add-sec">+ قسم جديد</button>`;
    panel.innerHTML = h;
    $("add-sec").onclick = () => {
      const id = "s" + uid().slice(0, 8);
      M.sections.push({ id, ar: "قسم جديد", en: "NEW", ico: "plate", hot: false, img: "", groups: [{ g: "", e: "", items: [] }] });
      openSecs.add(id); changed(); drawPanel(); $("sh-body").scrollTop = $("sh-body").scrollHeight;
    };
    loadSortable().then(() => {
      if (tab !== "items") return;
      sorts.push(Sortable.create($("a-secs"), { handle: ".sh", animation: 160, onEnd: e => { if (e.oldIndex === e.newIndex) return; const [x] = M.sections.splice(e.oldIndex, 1); M.sections.splice(e.newIndex, 0, x); changed(); drawPanel(); } }));
      panel.querySelectorAll(".a-items").forEach(ul => sorts.push(Sortable.create(ul, { handle: ".ih", animation: 160, onEnd: e => { if (e.oldIndex === e.newIndex) return; const arr = M.sections[+ul.dataset.si].groups[+ul.dataset.gi].items; const [x] = arr.splice(e.oldIndex, 1); arr.splice(e.newIndex, 0, x); changed(); drawPanel(); } })));
    }).catch(() => panel.insertAdjacentHTML("afterbegin", '<p class="hint">السحب ما اشتغل لأن النت ضعيف. حدّث الصفحة وجرب مرة ثانية.</p>'));
  }
  const itemAt = p => { const [si, gi, ii] = p.split("-").map(Number); return { arr: M.sections[si].groups[gi].items, ii, it: M.sections[si].groups[gi].items[ii] }; };
  panel.addEventListener("click", e => {
    const tg = e.target.closest("[data-tg]");
    if (tg) { const id = tg.dataset.tg; openSecs.has(id) ? openSecs.delete(id) : openSecs.add(id); drawPanel(); return; }
    const add = e.target.closest("[data-add]");
    if (add) { const [si, gi] = add.dataset.add.split("-").map(Number); M.sections[si].groups[gi].items.push({ k: uid(), n: "صنف جديد", e: "", p: 0 }); changed(); drawPanel(); setMsg("ضفت صنف جديد بآخر المجموعة. اكتب اسمه وسعره."); return; }
    const del = e.target.closest("[data-del]");
    if (del) { const { arr, ii, it } = itemAt(del.dataset.del); if (!confirmStep(del, `اضغط مرة ثانية حتى تحذف "${it.n}"`)) return; arr.splice(ii, 1); changed(); drawPanel(); setMsg(`انحذف "${it.n}". يرجع إذا تضغط تراجع قبل الحفظ.`); return; }
    const rm = e.target.closest("[data-rmimg]");
    if (rm) { delete itemAt(rm.dataset.rmimg).it.img; changed(); drawPanel(); return; }
    const ds = e.target.closest("[data-delsec]");
    if (ds) { const s = M.sections[+ds.dataset.delsec]; if (!confirmStep(ds, `اضغط مرة ثانية حتى تحذف قسم "${s.ar}" وكل أصنافه`)) return; M.sections.splice(+ds.dataset.delsec, 1); changed(); drawPanel(); }
  });
  panel.addEventListener("input", e => {
    const el = e.target, k = el.dataset.k; if (!k || el.type === "file") return;
    if (el.dataset.p) {
      const { it } = itemAt(el.dataset.p);
      if (k === "av") { if (el.checked) delete it.x; else it.x = 1; }
      else if (k === "n") it.n = el.value;
      else if (k === "e") it.e = el.value;
      else {
        const v = F.digits(el.value); if (el.value !== v) el.value = v;
        if (k === "p") it.p = v ? +v : 0; else { if (v) it.o = +v; else delete it.o; }
        const pe = $("p-" + el.dataset.p), oe = $("o-" + el.dataset.p);
        pe.classList.toggle("bad-in", !(it.p > 0) || it.p > F.MAXP);
        oe.classList.toggle("bad-in", !!it.o && (it.o <= it.p || it.o > F.MAXP));
      }
    } else if (el.dataset.s) {
      const s = M.sections[+el.dataset.s];
      if (k === "sar") s.ar = el.value; else if (k === "sen") s.en = el.value; else if (k === "hot") s.hot = el.checked; else if (k === "ico") s.ico = el.value;
    } else if (el.dataset.g) {
      const [si, gi] = el.dataset.g.split("-").map(Number), g = M.sections[si].groups[gi];
      if (k === "gar") g.g = el.value; else g.e = el.value;
    } else setField(k, el);
    changed();
  });
  panel.addEventListener("change", async e => {
    const el = e.target;
    if (el.dataset.k === "off") { drawPanel(); return; }
    if (el.type !== "file" || !el.files || !el.files[0]) return;
    setMsg("جاري رفع الصورة…");
    try {
      const url = await uploadImg(el.files[0]);
      if (el.dataset.k === "simg") M.sections[+el.dataset.s].img = url; else itemAt(el.dataset.p).it.img = url;
      changed(); drawPanel(); setMsg("انرفعت الصورة. اضغط حفظ حتى تطلع للزبائن.");
    } catch (err) { setMsg("ما انرفعت الصورة. جرب صورة ثانية أو تأكد من النت."); }
  });
  async function uploadImg(file) {
    if (!/^image\//.test(file.type)) throw new Error("type");
    const bmp = await createImageBitmap(file), max = 1000, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, "image/webp", 0.8)) || await new Promise(r => cv.toBlob(r, "image/jpeg", 0.82));
    const ext = blob.type === "image/webp" ? "webp" : "jpg", path = `items/${uid()}${uid()}.${ext}`;
    const { error } = await sb.storage.from("fm-images").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    return sb.storage.from("fm-images").getPublicUrl(path).data.publicUrl;
  }

  /* ---------- المعلومات ---------- */
  function pInfo() {
    const f = M.info, inp = (k, v, ex = "") => `<input data-k="${k}" value="${F.esc(v || "")}" ${ex}>`;
    let h = `<div class="card"><h4>معلومات المطعم</h4><div class="two">
      <label class="fld">الاسم${inp("name", f.name)}</label><label class="fld">الاسم بالإنكليزي${inp("name_en", f.name_en, 'dir="ltr"')}</label>
      <label class="fld">الوصف تحت الاسم${inp("tagline", f.tagline)}</label><label class="fld">الوصف بالإنكليزي${inp("tagline_en", f.tagline_en, 'dir="ltr"')}</label>
      <label class="fld">العنوان${inp("address", f.address)}</label><label class="fld">العنوان بالإنكليزي${inp("address_en", f.address_en, 'dir="ltr"')}</label>
    </div></div>
    <div class="card"><h4>التواصل</h4><div class="two">
      <label class="fld">رقم الواتساب (إذا تمسحه الزر يختفي)${inp("wa", f.wa, 'class="num" inputmode="tel"')}</label>
      <label class="fld">رقم الهاتف الأول${inp("ph0", f.phones[0], 'class="num" inputmode="tel"')}</label>
      <label class="fld">رقم الهاتف الثاني${inp("ph1", f.phones[1], 'class="num" inputmode="tel"')}</label>
    </div><label class="fld">رابط خرائط Google (لازم يبدي بـ https://)${inp("maps", f.maps, `class="num${f.maps && !F.safeUrl(f.maps) ? " bad-in" : ""}" placeholder="https://maps.app.goo.gl/..."`)}</label></div>
    <div class="card"><h4>الواي فاي</h4><p class="hint">إذا تتركه فارغ ما يطلع للزبائن.</p><div class="two"><label class="fld">اسم الشبكة${inp("ssid", f.wifi.ssid, 'dir="ltr"')}</label><label class="fld">الرمز${inp("pass", f.wifi.pass, 'dir="ltr"')}</label></div></div>
    <div class="card"><h4>أوقات الدوام (بتوقيت بغداد)</h4><p class="hint">إذا وقت السد قبل وقت الفتح، يعني المطعم يسد بعد نص الليل.</p><div class="hgrid">`;
    f.hours.forEach((x, i) => { h += `<div class="hline${x.off ? " off" : ""}"><b>${F.DAYS.ar[i]}</b><label class="sw"><input type="checkbox" data-k="off" data-i="${i}"${x.off ? " checked" : ""}>عطلة</label><label class="fld">يفتح<input type="time" data-k="ho" data-i="${i}" value="${x.o}"${x.off ? " disabled" : ""}></label><label class="fld">يسد<input type="time" data-k="hc" data-i="${i}" value="${x.c}"${x.off ? " disabled" : ""}></label></div>`; });
    h += `</div><button class="link" type="button" id="same-all">طبّق أوقات الأحد على كل الأيام</button></div>`;
    h += `<div class="card"><h4>تغيير رمز الدخول</h4><p class="hint">أرقام بس، من 4 إلى 12 رقم. كل ما يكون أطول يكون أأمن.</p><div class="two"><label class="fld">الرمز الجديد<input id="pin1" class="num" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12"></label><label class="fld">عيد الرمز<input id="pin2" class="num" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12"></label></div><div><button class="btn ghost sm" type="button" id="pin-save">غيّر الرمز</button></div></div>`;
    panel.innerHTML = h;
    $("pin-save").onclick = async () => {
      const a = F.digits($("pin1").value), b = F.digits($("pin2").value);
      if (a.length < 4) { setMsg("الرمز لازم يكون 4 أرقام على الأقل"); return; }
      if (a !== b) { setMsg("الرمزين مو نفس الشي"); return; }
      $("pin-save").disabled = true;
      const { error } = await sb.auth.updateUser({ password: pinToPw(a) });
      $("pin-save").disabled = false;
      if (error) { setMsg("ما تغيّر الرمز. سجّل خروج وادخل مرة ثانية وجرب."); return; }
      $("pin1").value = ""; $("pin2").value = "";
      await sb.from("fm_log").insert({ who: me.name, changes: ["غيّر رمز الدخول"] });
      setMsg("تغيّر الرمز. من المرة الجاية ادخل بالرمز الجديد.");
    };
    $("same-all").onclick = () => { const a = M.info.hours[0]; M.info.hours = M.info.hours.map(() => ({ ...a })); changed(); drawPanel(); };
  }
  function setField(k, el) {
    const f = M.info, i = +el.dataset.i, v = el.value;
    if (["name", "name_en", "tagline", "tagline_en", "address", "address_en", "wa"].includes(k)) f[k] = v;
    else if (k === "maps") { f.maps = v.trim(); el.classList.toggle("bad-in", !!f.maps && !F.safeUrl(f.maps)); }
    else if (k === "ph0") f.phones[0] = v; else if (k === "ph1") f.phones[1] = v;
    else if (k === "ssid") f.wifi.ssid = v; else if (k === "pass") f.wifi.pass = v;
    else if (k === "off") f.hours[i].off = el.checked; else if (k === "ho") f.hours[i].o = v || "00:00"; else if (k === "hc") f.hours[i].c = v || "00:00";
    else if (k === "brand") M.look.brand = v; else if (k === "brand2") M.look.brand2 = v; else if (k === "splash") M.look.splash = el.checked;
  }

  /* ---------- الشكل ---------- */
  function pLook() {
    const L = M.look; F.FONTS.forEach(F.loadFont);
    panel.innerHTML = `<div class="card"><h4>ألوان المنيو</h4><div class="swatches">${PRESETS.map((p, i) => `<button type="button" class="swt${p.a === L.brand && p.b === L.brand2 ? " on" : ""}" data-pre="${i}"><i style="background:${p.a}"></i><i style="background:${p.b};margin-inline-start:-14px"></i>${p.n}</button>`).join("")}</div>
      <div class="colors"><label>اللون الأساسي<input type="color" data-k="brand" value="${L.brand}"></label><label>لون الأسعار<input type="color" data-k="brand2" value="${L.brand2}"></label></div><p class="hint">الألوان تتطبق على هالصفحة هسه حتى تشوفها. الوضع الليلي يتعدل وحده.</p></div>
      <div class="card"><h4>الخط</h4><div class="fonts">${F.FONTS.map(fn => `<button type="button" class="fnt${fn === L.font ? " on" : ""}" data-font="${fn}" style="font-family:'${fn}',system-ui"><b>كنتاكي وبيتزا</b><small>${fn}</small></button>`).join("")}</div></div>
      <div class="card"><div class="row"><h4>صفحة الترحيب</h4><label class="sw"><input type="checkbox" data-k="splash"${L.splash ? " checked" : ""}>مفعّلة</label></div><p class="hint">تطلع أقل من ثانية باللوگو، مرة وحدة لكل زيارة.</p></div>`;
    panel.querySelectorAll("[data-pre]").forEach(b => (b.onclick = () => { const p = PRESETS[+b.dataset.pre]; L.brand = p.a; L.brand2 = p.b; changed(); drawPanel(); }));
    panel.querySelectorAll("[data-font]").forEach(b => (b.onclick = () => { L.font = b.dataset.font; changed(); drawPanel(); }));
  }

  /* ---------- الإحصائيات ---------- */
  async function pStats() {
    panel.innerHTML = `<div class="row"><div class="seg" id="seg">${[[1, "اليوم"], [7, "7 أيام"], [30, "30 يوم"], [90, "3 أشهر"]].map(([d, l]) => `<button type="button" data-d="${d}" class="${d === statDays ? "on" : ""}">${l}</button>`).join("")}</div><button class="btn ghost sm" type="button" id="st-ref">تحديث</button></div><p class="hint" id="st-load">جاري تحميل الإحصائيات…</p><div id="st" style="display:grid;gap:14px"></div>`;
    $("seg").onclick = e => { const b = e.target.closest("[data-d]"); if (b) { statDays = +b.dataset.d; pStats(); } };
    $("st-ref").onclick = pStats;
    const { data: S, error } = await sb.rpc("fm_stats", { p_days: statDays });
    if (tab !== "stats") return;
    $("st-load").hidden = true;
    if (error || !S) { $("st").innerHTML = `<p class="hint">ما گدرنا نجيب الإحصائيات. تأكد من النت.</p>`; return; }
    const secName = id => { const s = M.sections.find(x => x.id === id); return s ? s.ar : id; };
    const hbars = (rows, label) => { const mx = Math.max(1, ...rows.map(r => r.n)); return rows.length ? rows.map(r => `<div class="hbar"><span>${F.esc(label(r))}</span><div class="bar"><i style="width:${Math.round(r.n / mx * 100)}%"></i></div><b>${F.fmt(r.n)}</b></div>`).join("") : '<p class="hint">ماكو بيانات بهالفترة.</p>'; };
    const vbars = (vals, labels) => { const mx = Math.max(1, ...vals); const top = vals.indexOf(Math.max(...vals)); return `<div class="vbars">${vals.map((v, i) => `<div class="${i === top && v ? "top" : ""}" title="${labels[i]}: ${v}">${v ? `<span>${v}</span>` : ""}<i style="height:${Math.round(v / mx * 100)}%"></i></div>`).join("")}</div><div class="vlabels">${labels.map((l, i) => `<span>${labels.length <= 12 || i % 3 === 0 || i === labels.length - 1 ? l : ""}</span>`).join("")}</div>`; };
    let h = `<div class="tiles">
      <div class="tile"><span>زبائن اليوم</span><b>${F.fmt(S.today)}</b><small>فتحوا المنيو ${F.fmt(S.today_views)} مرة</small></div>
      <div class="tile"><span>زبائن آخر 7 أيام</span><b>${F.fmt(S.week)}</b></div>
      <div class="tile"><span>زبائن الفترة</span><b>${F.fmt(S.period)}</b><small>${S.days === 1 ? "آخر 24 ساعة" : "آخر " + S.days + " يوم"}</small></div>
      <div class="tile"><span>مرات فتح المنيو</span><b>${F.fmt(S.views)}</b><small>بالفترة</small></div></div>`;
    if (!S.views) h += `<div class="card"><p class="hint">لسه ماكو زيارات بهالفترة. أول ما الزبائن يفتحون المنيو من الباركود، الأرقام تطلع هنا.</p></div>`;
    const nw = S.new || 0, rt = S.returning || 0, tot = Math.max(1, nw + rt);
    h += `<div class="card"><h4>زبائن جدد ومرجعين</h4><div class="split"><i style="width:${nw / tot * 100}%;background:var(--brand)"></i><i style="width:${rt / tot * 100}%;background:var(--brand2)"></i></div><div class="legend"><span><i style="background:var(--brand)"></i>جدد: ${F.fmt(nw)}</span><span><i style="background:var(--brand2)"></i>رجعوا مرة ثانية: ${F.fmt(rt)}</span></div></div>`;
    if (S.days > 1) {
      const map = Object.fromEntries((S.daily || []).map(r => [r.d, r.n])), vals = [], labs = [];
      for (let i = Math.min(S.days, 31) - 1; i >= 0; i--) {
        const dt = new Date(Date.now() - i * 864e5), key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(dt);
        vals.push(map[key] || 0); labs.push(key.slice(8));
      }
      h += `<div class="card"><h4>الزبائن كل يوم${S.days > 31 ? " (آخر 31 يوم)" : ""}</h4>${vbars(vals, labs)}</div>`;
    }
    const hm = Object.fromEntries((S.hours || []).map(r => [r.h, r.n])), hv = [...Array(24)].map((_, i) => hm[i] || 0);
    const peak = hv.indexOf(Math.max(...hv));
    h += `<div class="card"><h4>أوقات الزحمة (حسب الساعة)</h4>${hv.some(Boolean) ? `<p class="hint">أكثر وقت: ${F.fmtT(peak * 60)} – ${F.fmtT((peak + 1) * 60)}</p>` : ""}${vbars(hv, hv.map((_, i) => i))}</div>`;
    const wm = Object.fromEntries((S.weekdays || []).map(r => [r.w, r.n]));
    h += `<div class="card"><h4>أيام الأسبوع</h4>${hbars([0, 1, 2, 3, 4, 5, 6].map(w => ({ w, n: wm[w] || 0 })), r => F.DAYS.ar[r.w])}</div>`;
    h += `<div class="card"><h4>أكثر الأقسام مشاهدة</h4>${hbars(S.sections || [], r => secName(r.k))}</div>`;
    h += `<div class="card"><h4>أكثر الأصناف اللي فتحوا صورتها</h4>${hbars(S.items || [], r => { const [sid, ...n] = String(r.k).split(":"); return n.join(":") + " · " + secName(sid); })}</div>`;
    h += `<div class="card"><h4>شنو يدورون بالبحث</h4>${hbars(S.searches || [], r => r.k)}</div>`;
    const A = S.actions || {};
    h += `<div class="card"><h4>تفاعل الزبائن</h4>${hbars(Object.keys(ACT).map(k => ({ k, n: A[k] || 0 })), r => ACT[r.k])}</div>`;
    h += `<div class="card"><h4>الطاولات</h4><p class="hint">يشتغل إذا كل طاولة إلها باركود خاص من تبويب "الباركود".</p>${hbars(S.tables || [], r => "طاولة " + r.k)}</div>`;
    h += `<div class="card"><h4>نوع الجهاز</h4>${hbars(S.devices || [], r => DEV[r.k] || r.k)}</div>`;
    h += `<p class="hint">الأرقام تنحسب بدون أي معلومات شخصية عن الزبون. "زبون" يعني جهاز واحد، وإذا نفس الشخص فتح المنيو من جهازين ينحسب مرتين.</p>`;
    $("st").innerHTML = h;
  }

  /* ---------- الباركود ---------- */
  async function pQr() {
    panel.innerHTML = `<div class="card"><h4>باركود المنيو</h4><p class="hint">كل باركود يفتح المنيو. باركود الطاولة يخلي الإحصائيات تبين أي طاولة تستخدم المنيو أكثر. نزّلها واطبعها.</p>
      <div class="row"><label class="fld" style="max-width:200px">عدد الطاولات<input class="num" id="qr-n" inputmode="numeric" value="${qrCount}"></label><button class="btn solid" type="button" id="qr-all">نزّل الكل</button></div></div><div class="qrs" id="qrs"><p class="hint">جاري التجهيز…</p></div>`;
    $("qr-n").oninput = e => { qrCount = Math.min(80, +F.digits(e.target.value) || 0); clearTimeout(pQr._t); pQr._t = setTimeout(renderQrs, 400); };
    $("qr-all").onclick = async () => { for (const a of panel.querySelectorAll("[data-dl]")) { a.click(); await new Promise(r => setTimeout(r, 350)); } };
    try { await loadQr(); } catch (e) { $("qrs").innerHTML = '<p class="hint">ما گدرنا نحمّل مولّد الباركود. تأكد من النت.</p>'; return; }
    renderQrs();
  }
  const logoImg = new Image(); logoImg.src = "../img/logo.webp";
  function qrCanvas(url, label) {
    const q = qrcode(0, "H"); q.addData(url); q.make();
    const n = q.getModuleCount(), cell = Math.floor(900 / (n + 8)), size = cell * (n + 8), pad = cell * 4, foot = 150;
    const cv = document.createElement("canvas"); cv.width = size; cv.height = size + foot;
    const x = cv.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = "#1a110c";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    if (logoImg.complete && logoImg.naturalWidth) {
      const lw = size * 0.26, lh = lw * logoImg.naturalHeight / logoImg.naturalWidth, lx = (size - lw) / 2, ly = (size - lh) / 2;
      x.fillStyle = "#fff"; x.fillRect(lx - cell, ly - cell, lw + 2 * cell, lh + 2 * cell); x.drawImage(logoImg, lx, ly, lw, lh);
    }
    x.fillStyle = "#3a2216"; x.textAlign = "center"; x.direction = "rtl";
    x.font = "800 64px Tajawal, system-ui, sans-serif"; x.fillText(label, size / 2, size + 40);
    x.font = "700 34px Tajawal, system-ui, sans-serif"; x.fillStyle = "#8a6f5c"; x.fillText("امسح الباركود وشوف المنيو", size / 2, size + 100);
    return cv;
  }
  function renderQrs() {
    const box = $("qrs"); if (!box) return; box.innerHTML = "";
    const list = [["المنيو", C.siteUrl, "familytime-menu"]];
    for (let i = 1; i <= qrCount; i++) list.push([`طاولة ${i}`, C.siteUrl + "?t=" + i, "familytime-table-" + i]);
    list.forEach(([label, url, file]) => {
      const cv = qrCanvas(url, label), d = document.createElement("div"); d.className = "qr";
      const a = document.createElement("a"); a.className = "btn ghost sm"; a.textContent = "تنزيل"; a.download = file + ".png"; a.href = cv.toDataURL("image/png"); a.dataset.dl = "1";
      const b = document.createElement("b"); b.textContent = label;
      d.append(cv, b, a); box.appendChild(d);
    });
  }

  /* ---------- السجل والنسخ الاحتياطية ---------- */
  async function pLog() {
    panel.innerHTML = '<p class="hint">جاري تحميل السجل…</p>';
    const { data, error } = await sb.from("fm_log").select("ts,who,changes").order("ts", { ascending: false }).limit(150);
    if (tab !== "log") return;
    if (error) { panel.innerHTML = '<p class="hint">ما گدرنا نجيب السجل. تأكد من النت.</p>'; return; }
    panel.innerHTML = data.length ? `<div class="log">${data.map(l => `<div class="lg"><div class="lg-h"><b>${F.esc(l.who || "مشرف")}</b><span>${F.dateTimeTxt(l.ts)}</span></div><ul>${(l.changes || []).map(c => `<li>${F.esc(c)}</li>`).join("")}</ul></div>`).join("")}</div>`
      : '<p class="hint">ماكو تعديلات بعد. أي تغيير تحفظه يطلع هنا: منو غيّره، شنو غيّر، ومتى.</p>';
  }
  async function pBackup() {
    panel.innerHTML = '<p class="hint">جاري تحميل النسخ…</p>';
    const { data, error } = await sb.from("fm_versions").select("id,ts,who,note").order("ts", { ascending: false }).limit(40);
    if (tab !== "backup") return;
    if (error) { panel.innerHTML = '<p class="hint">ما گدرنا نجيب النسخ. تأكد من النت.</p>'; return; }
    panel.innerHTML = `<p class="hint">قبل كل حفظ، المنيو القديم ينحفظ هنا. إذا صار غلط، اختار نسخة واضغط "رجّعها"، وبعدها اضغط حفظ.</p>` +
      (data.length ? `<div class="log">${data.map(v => `<div class="lg"><div class="lg-h"><b>${F.dateTimeTxt(v.ts)}</b><span>قبل تعديل ${F.esc(v.who || "مشرف")}</span></div><p class="hint">${F.esc(v.note || "")}</p><div><button class="btn ghost sm" type="button" data-ver="${v.id}">رجّعها</button></div></div>`).join("")}</div>` : '<p class="hint">ماكو نسخ بعد. أول حفظ يسوي أول نسخة.</p>');
    panel.querySelectorAll("[data-ver]").forEach(b => (b.onclick = async () => {
      if (!confirmStep(b, "اضغط مرة ثانية حتى ترجع هالنسخة كمسودة (ما تنحفظ إلا تضغط حفظ)")) return;
      const { data: v, error: e } = await sb.from("fm_versions").select("data").eq("id", b.dataset.ver).single();
      if (e) { setMsg("ما گدرنا نجيب النسخة"); return; }
      M = normalize(v.data); changed(); setMsg("رجعت النسخة كمسودة. راجعها واضغط حفظ حتى تطلع للزبائن.");
    }));
  }

  /* ---------- الحفظ ---------- */
  function diff(A, B) {
    const out = [], J = JSON.stringify, ids = x => x.sections.map(s => s.id).join();
    const as = new Map(A.sections.map(s => [s.id, s])), bs = new Map(B.sections.map(s => [s.id, s]));
    B.sections.forEach(s => { if (!as.has(s.id)) out.push(`أضاف قسم "${s.ar}"`); });
    A.sections.forEach(s => { if (!bs.has(s.id)) out.push(`حذف قسم "${s.ar}"`); });
    if (ids({ sections: A.sections.filter(s => bs.has(s.id)) }) !== ids({ sections: B.sections.filter(s => as.has(s.id)) })) out.push("غيّر ترتيب الأقسام");
    const items = d => { const m = new Map(); d.sections.forEach(s => s.groups.forEach((g, gi) => g.items.forEach(it => m.set(it.k, { it, s, gi })))); return m; };
    const ai = items(A), bi = items(B);
    B.sections.forEach(sb2 => {
      const sa = as.get(sb2.id); if (!sa) return;
      if (sa.ar !== sb2.ar || sa.en !== sb2.en) out.push(`غيّر اسم قسم "${sa.ar}" إلى "${sb2.ar}"`);
      if (!!sa.hot !== !!sb2.hot) out.push(sb2.hot ? `خلّى "${sb2.ar}" قسم مميز` : `شال التمييز من "${sb2.ar}"`);
      if ((sa.img || "") !== (sb2.img || "")) out.push(`غيّر صورة غلاف "${sb2.ar}"`);
      sb2.groups.forEach((g, gi) => { const ga = sa.groups[gi]; if (!ga) return; const ka = ga.items.map(i => i.k).filter(k => bi.has(k)), kb = g.items.map(i => i.k).filter(k => ai.has(k)); if (ka.join() !== kb.join()) out.push(`غيّر ترتيب أصناف "${sb2.ar}"`); });
    });
    bi.forEach(({ it, s }, k) => {
      const o = ai.get(k);
      if (!o) { out.push(`أضاف "${it.n}" بـ ${s.ar} بسعر ${F.fmt(it.p)}`); return; }
      const a = o.it, nm = `"${it.n}"`;
      if (a.n !== it.n) out.push(`غيّر اسم "${a.n}" إلى ${nm}`);
      if ((a.e || "") !== (it.e || "")) out.push(`عدّل الاسم الإنكليزي لـ ${nm}`);
      if (a.p !== it.p) out.push(`سعر ${nm} من ${F.fmt(a.p)} إلى ${F.fmt(it.p)}`);
      if ((a.o || 0) !== (it.o || 0)) out.push(it.o ? `حط خصم على ${nm} (قبل الخصم ${F.fmt(it.o)})` : `شال الخصم من ${nm}`);
      if (!!a.x !== !!it.x) out.push(it.x ? `${nm} صار غير متوفر` : `${nm} رجع متوفر`);
      if ((a.img || "") !== (it.img || "")) out.push(it.img ? (a.img ? `غيّر صورة ${nm}` : `ضاف صورة لـ ${nm}`) : `شال صورة ${nm}`);
    });
    ai.forEach(({ it, s }, k) => { if (!bi.has(k)) out.push(`حذف "${it.n}" من ${s.ar}`); });
    const a = A.info, b = B.info;
    if (J(a.hours) !== J(b.hours)) out.push("عدّل أوقات الدوام");
    if (J(a.wifi) !== J(b.wifi)) out.push("عدّل الواي فاي");
    if (J(a.phones) !== J(b.phones)) out.push("عدّل أرقام الهاتف");
    if ((a.wa || "") !== (b.wa || "")) out.push("عدّل رقم الواتساب");
    if (a.address !== b.address || a.address_en !== b.address_en || a.maps !== b.maps) out.push("عدّل العنوان أو الخريطة");
    if (a.name !== b.name || a.name_en !== b.name_en || a.tagline !== b.tagline || a.tagline_en !== b.tagline_en) out.push("عدّل اسم المطعم أو الوصف");
    if (A.look.brand !== B.look.brand || A.look.brand2 !== B.look.brand2) out.push("غيّر الألوان");
    if (A.look.font !== B.look.font) out.push("غيّر الخط إلى " + B.look.font);
    if (A.look.splash !== B.look.splash) out.push(B.look.splash ? "شغّل صفحة الترحيب" : "طفّى صفحة الترحيب");
    return out;
  }
  saveBtn.addEventListener("click", async () => {
    if (saving) return;
    saving = true; saveBtn.disabled = true;
    const fail = m => { saving = false; setMsg(m); saveBtn.disabled = !isDirty(); $("cancel").disabled = false; };
    for (const s of M.sections) {
      if (!s.ar.trim()) return fail("اكتب اسم لكل قسم");
      for (const g of s.groups) for (const it of g.items) {
        if (!it.n.trim()) return fail(`أكو صنف بدون اسم بقسم ${s.ar}`);
        if (!(it.p > 0)) return fail(`اكتب سعر لـ "${it.n}"`);
        if (it.p > F.MAXP || (it.o || 0) > F.MAXP) return fail(`السعر لـ "${it.n}" كبير كلش، تأكد منه`);
        if (it.o && it.o <= it.p) return fail(`السعر قبل الخصم لـ "${it.n}" لازم يكون أكبر من السعر الحالي`);
      }
    }
    if (M.info.maps && !F.safeUrl(M.info.maps)) return fail("رابط الخريطة لازم يبدي بـ https://");
    $("cancel").disabled = true; setMsg("جاري الحفظ…");
    const changes = diff(SAVED, M), next = F.clone(M); next.updated = Date.now();
    const { data: rows, error } = await sb.from("fm_menu").update({ data: next, updated_at: new Date().toISOString() }).eq("id", 1).eq("updated_at", SAVED_AT).select("updated_at");
    if (error) return fail(/JWT|auth/i.test(error.message) ? "انتهت جلسة الدخول. ادخل مرة ثانية واحفظ." : "ما انحفظ، تأكد من النت وجرب مرة ثانية.");
    if (!rows || !rows.length) return fail("مشرف ثاني حفظ تعديل قبلك. انسخ تعديلاتك بمكان، وحدّث الصفحة حتى تجيب آخر نسخة.");
    await sb.from("fm_versions").insert({ who: me.name, note: changes.slice(0, 4).join("، ") || "تعديلات بسيطة", data: SAVED });
    await sb.from("fm_log").insert({ who: me.name, changes: changes.length ? changes : ["تعديلات بسيطة"] });
    SAVED = next; SAVED_AT = rows[0].updated_at; M = F.clone(next);
    saving = false; $("cancel").disabled = false; refreshDirty();
    setMsg(`تم الحفظ (${changes.length || 1} تغيير). المنيو تحدث للزبائن.`);
  });

  /* ---------- البداية ---------- */
  enter().catch(() => showLogin("صار خطأ بالتحميل. حدّث الصفحة."));
})();
