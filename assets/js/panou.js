/* Panoul de comenzi pentru tableta de la bar.
   Cu Supabase: patronul intră cu e-mail și parolă, comenzile se reîncarcă la câteva secunde, cu sunet la comandă nouă.
   Fără Supabase (demo): citește comenzile trimise din acest browser. */
(() => {
  const C = JSON.parse(document.getElementById("comenzi-config").textContent);
  const live = Boolean(C.supabaseUrl && C.supabaseCheie);
  const base = (C.supabaseUrl || "").replace(/\/$/, "");
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const lei = (n) => Number(n).toLocaleString("ro-RO") + " lei";
  const ora = (iso) => new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /* ---------- Autentificare (doar cu Supabase) ---------- */
  let session = store.get("panou-sesiune");
  async function auth(body, grant) {
    const r = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: C.supabaseCheie }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("auth");
    const j = await r.json();
    session = { access: j.access_token, refresh: j.refresh_token, until: Date.now() + (j.expires_in - 60) * 1000 };
    store.set("panou-sesiune", session);
  }
  async function token() {
    if (session && Date.now() > session.until) await auth({ refresh_token: session.refresh }, "refresh_token");
    return session.access;
  }
  async function rest(path, options = {}) {
    const r = await fetch(`${base}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: C.supabaseCheie, Authorization: "Bearer " + (await token()), "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (r.status === 401) { session = null; store.set("panou-sesiune", null); throw new Error("401"); }
    if (!r.ok) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  }

  /* ---------- Sursa comenzilor ---------- */
  const since = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
  const api = live ? {
    list: () => rest(`comenzi?select=*&creat=gte.${encodeURIComponent(since())}&order=creat.desc`),
    update: (id, patch) => rest(`comenzi?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } }),
  } : {
    list: async () => (store.get("comenzi-demo") || []).filter((o) => o.creat >= since()),
    update: async (id, patch) => store.set("comenzi-demo", (store.get("comenzi-demo") || []).map((o) => (o.id === id ? { ...o, ...patch } : o))),
  };

  /* ---------- Sunet la comandă nouă ---------- */
  let audio;
  function ding() {
    if (!audio) return;
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.4, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.4);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.45);
    });
  }

  /* ---------- Afișare ---------- */
  const TIP = { ridicare: "Ridicare", livrare: "Livrare", masa: "La masă" };
  const COLS = [["noua", "Noi"], ["acceptata", "În lucru"], ["gata", "Gata"]];
  let known = null;
  function card(o) {
    const items = o.produse.map((p) => `<li><b>${p.cant}×</b> ${esc(p.nume)}${p.optiuni?.length ? `<small>${esc(p.optiuni.map((x) => x.nume).join(", "))}</small>` : ""}</li>`).join("");
    const who = o.tip === "masa" ? `Masa ${esc(o.masa)}` : `${esc(o.nume)} · <a href="tel:${esc(o.telefon)}">${esc(o.telefon)}</a>`;
    const actions = {
      noua: [15, 20, 30].map((m) => `<button data-act="acceptata" data-min="${m}" class="button button-dark">Accept · ${m} min</button>`).join("") + `<button data-act="refuzata" class="button button-outline">Refuz</button>`,
      acceptata: `<button data-act="gata" class="button button-dark">${o.tip === "livrare" ? "Pleacă la livrare" : "E gata"}</button>`,
      gata: `<button data-act="finalizata" class="button button-dark">Predată</button>`,
    }[o.stare] || "";
    return `<article class="ticket is-${o.stare}" data-id="${o.id}">
      <header><strong>#${esc(o.cod)}</strong><span>${ora(o.creat)} · ${TIP[o.tip] || o.tip}</span></header>
      <p class="ticket-who">${who}</p>
      ${o.adresa ? `<p class="ticket-addr">${esc(o.adresa)}</p>` : ""}
      ${o.pentru && o.pentru !== "acum" ? `<p class="ticket-when">Pentru ${esc(o.pentru)}</p>` : ""}
      <ul>${items}</ul>
      ${o.observatii ? `<p class="ticket-obs">„${esc(o.observatii)}”</p>` : ""}
      <p class="ticket-total">${lei(o.total)}${Number(o.taxa) ? ` <small>(livrare ${lei(o.taxa)})</small>` : ""}</p>
      <div class="ticket-actions">${actions}</div>
    </article>`;
  }
  async function refresh() {
    let orders;
    try { orders = await api.list(); } catch (e) { if (String(e.message) === "401") return showLogin(); $("#panou-stare").textContent = "Fără legătură. Reîncerc…"; return; }
    const fresh = orders.filter((o) => o.stare === "noua");
    if (known && fresh.some((o) => !known.has(o.id))) ding();
    known = new Set(orders.map((o) => o.id));
    document.title = (fresh.length ? `(${fresh.length}) ` : "") + "Comenzi";
    $("#panou-stare").textContent = `Actualizat la ${new Date().toLocaleTimeString("ro-RO")} · ${orders.length} comenzi azi · ${lei(orders.filter((o) => o.stare !== "refuzata").reduce((s, o) => s + Number(o.total), 0))}`;
    $("#panou-coloane").innerHTML = COLS.map(([key, title]) => {
      const list = orders.filter((o) => o.stare === key).sort((a, b) => a.creat.localeCompare(b.creat));
      return `<section class="col"><h2>${title} <span>${list.length}</span></h2>${list.map(card).join("") || '<p class="col-empty">Nimic aici.</p>'}</section>`;
    }).join("");
    const done = orders.filter((o) => ["finalizata", "refuzata"].includes(o.stare));
    $("#panou-istoric").innerHTML = done.length ? `<h2>Încheiate azi</h2><ul>${done.map((o) => `<li>#${esc(o.cod)} · ${ora(o.creat)} · ${TIP[o.tip]} · ${lei(o.total)} · ${o.stare === "refuzata" ? "refuzată" : "predată"}</li>`).join("")}</ul>` : "";
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest(".ticket").dataset.id;
    b.disabled = true;
    try { await api.update(id, { stare: b.dataset.act, ...(b.dataset.min ? { minute: Number(b.dataset.min) } : {}) }); } catch { alert("Nu s-a salvat. Încearcă din nou."); }
    refresh();
  });

  let loop;
  function start() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    $("#panou-login").hidden = true;
    $("#panou").hidden = false;
    refresh();
    clearInterval(loop);
    loop = setInterval(refresh, live ? 6000 : 2000);
    addEventListener("storage", (e) => { if (e.key === "comenzi-demo") refresh(); });
    if ("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(() => {});
  }
  function showLogin() {
    clearInterval(loop);
    $("#panou").hidden = true;
    $("#panou-login").hidden = false;
    $("#login-campuri").hidden = !live || Boolean(session);
    $("#login-demo").hidden = live;
  }
  $("#panou-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $("#login-eroare").textContent = "";
    if (live && !session) {
      try { await auth({ email: f.get("email"), password: f.get("parola") }, "password"); }
      catch { $("#login-eroare").textContent = "E-mailul sau parola nu se potrivesc."; return; }
    }
    start();
  });
  $("#panou-iesire").addEventListener("click", () => { session = null; store.set("panou-sesiune", null); showLogin(); });
  showLogin();
})();
