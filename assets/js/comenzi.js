/* Comenzi online: coș, opțiuni (mărime, extra, meniu), ridicare / livrare / la masă, trimitere și starea comenzii.
   Configurația vine din <script id="comenzi-config"> scris de sursa/genereaza.py.
   Fără Supabase configurat rulează în mod demonstrație: comenzile rămân în acest browser și se văd în panou.html. */
(() => {
  const node = document.getElementById("comenzi-config");
  if (!node) return;
  const C = JSON.parse(node.textContent);
  const live = Boolean(C.supabaseUrl && C.supabaseCheie);
  const KEY = { cart: "comenzi-cos", last: "comenzi-ultima", current: "comenzi-curenta", demo: "comenzi-demo", who: "comenzi-client" };
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  const lei = (n) => { const v = Math.round(n * 100) / 100; return v.toLocaleString("ro-RO", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " lei"; };
  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    node.append(...kids.flat().filter((kid) => kid != null && kid !== false));
    return node;
  };
  const table = new URLSearchParams(location.search).get("masa");
  const tableNo = table && /^\d{1,3}$/.test(table) ? table : "";

  /* ---------- Program: e deschis acum? (ora României) ---------- */
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY_RO = { Monday: "luni", Tuesday: "marți", Wednesday: "miercuri", Thursday: "joi", Friday: "vineri", Saturday: "sâmbătă", Sunday: "duminică" };
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  function openState() {
    const parts = Object.fromEntries(clock.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const now = Number(parts.hour) * 60 + Number(parts.minute);
    const today = (C.program || []).filter((row) => row.zile.includes(parts.weekday));
    const open = today.some((row) => { const s = minutes(row.deschide), e = minutes(row.inchide); return e > s ? now >= s && now < e : now >= s || now < e; });
    if (open || !C.program?.length) return { open: true };
    // Următoarea deschidere: azi mai târziu sau într-una din zilele următoare.
    for (let i = 0; i < 8; i++) {
      const day = DAYS[(DAYS.indexOf(parts.weekday) + i) % 7];
      const rows = C.program.filter((row) => row.zile.includes(day)).map((row) => row.deschide).sort();
      const next = rows.find((t) => i > 0 || minutes(t) > now);
      if (next) return { open: false, next: (i === 0 ? "azi" : i === 1 ? "mâine" : DAY_RO[day]) + " de la " + next };
    }
    return { open: false, next: "" };
  }

  /* ---------- Coșul ---------- */
  let cart = store.get(KEY.cart) || [];
  const saveCart = () => { store.set(KEY.cart, cart); render(); };
  const lineKey = (item) => item.id + "|" + item.optiuni.map((o) => o.nume).join("+");
  const unitPrice = (item) => item.pret + item.optiuni.reduce((sum, o) => sum + (o.pret || 0), 0);
  const subtotal = () => cart.reduce((sum, item) => sum + unitPrice(item) * item.cant, 0);
  const count = () => cart.reduce((sum, item) => sum + item.cant, 0);
  function addToCart(item) {
    const same = cart.find((line) => lineKey(line) === lineKey(item));
    if (same) same.cant = Math.min(20, same.cant + item.cant);
    else cart.push(item);
    saveCart();
    bump();
  }

  /* ---------- Butoanele „+” de lângă produse ---------- */
  function decorate() {
    document.querySelectorAll("[data-pid]").forEach((row) => {
      const product = C.produse[row.dataset.pid];
      if (!product || product.pret == null || row.querySelector(".add-btn")) return;
      const button = el("button", {
        type: "button", class: "add-btn", "aria-label": `Adaugă ${product.nume} în coș`,
        onclick: () => (groupsFor(product).length ? openSheet(row.dataset.pid) : addToCart({ id: row.dataset.pid, nume: product.nume, pret: product.pret, optiuni: [], cant: 1 })),
      }, el("span", { "aria-hidden": "true", text: "+" }));
      (row.querySelector(".board-line, .qm-add-slot") || row).append(button);
    });
  }
  const groupsFor = (product) => [...(product.grupuri || []), ...(C.categorii[product.cat] || [])].map((key) => C.grupuri[key]).filter(Boolean);

  /* ---------- Fereastra unui produs: mărime, extra, meniu, cantitate ---------- */
  const sheet = el("dialog", { class: "order-sheet", "aria-labelledby": "sheet-title" });
  document.body.append(sheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  function openSheet(pid) {
    const product = C.produse[pid];
    let qty = 1;
    const form = el("form", { method: "dialog", class: "sheet-form" });
    const total = el("span", { class: "sheet-total" });
    const qtyOut = el("output", { class: "qty-value", "aria-live": "polite", text: "1" });
    const chosen = () => [...form.querySelectorAll("input:checked")].map((input) => ({ nume: input.value, pret: Number(input.dataset.pret) }));
    const refresh = () => { qtyOut.textContent = qty; total.textContent = lei((product.pret + chosen().reduce((s, o) => s + o.pret, 0)) * qty); };
    const groups = groupsFor(product).map((group, gi) => el("fieldset", { class: "sheet-group" },
      el("legend", { text: group.titlu }),
      group.variante.map((variant, vi) => el("label", { class: "sheet-option" },
        el("input", {
          type: group.tip === "una" ? "radio" : "checkbox", name: "g" + gi, value: variant.nume,
          "data-pret": variant.pret || 0, checked: group.tip === "una" && vi === 0, onchange: refresh,
        }),
        el("span", { text: variant.nume }),
        el("span", { class: "sheet-option-price", text: variant.pret ? "+" + lei(variant.pret) : group.tip === "una" ? "" : "gratuit" }),
      )),
    ));
    form.append(
      el("div", { class: "sheet-head" },
        el("h2", { id: "sheet-title", text: product.nume }),
        el("button", { type: "button", class: "close-button", "aria-label": "Închide", onclick: () => sheet.close(), text: "×" })),
      ...(product.descriere ? [el("p", { class: "sheet-desc", text: product.descriere })] : []),
      ...(C.exemple && groups.length ? [el("p", { class: "order-note", text: "Prețurile pentru mărimi și extra sunt exemple, încă neconfirmate de local." })] : []),
      ...groups,
      el("div", { class: "sheet-foot" },
        el("div", { class: "qty", role: "group", "aria-label": "Cantitate" },
          el("button", { type: "button", "aria-label": "Mai puțin", onclick: () => { qty = Math.max(1, qty - 1); refresh(); }, text: "−" }),
          qtyOut,
          el("button", { type: "button", "aria-label": "Mai mult", onclick: () => { qty = Math.min(20, qty + 1); refresh(); }, text: "+" })),
        el("button", { class: "button button-dark sheet-add", value: "add" }, "Adaugă ", total)),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addToCart({ id: pid, nume: product.nume, pret: product.pret, optiuni: chosen(), cant: qty });
      sheet.close();
    });
    sheet.replaceChildren(form);
    refresh();
    sheet.showModal();
  }

  /* ---------- Bara coșului (jos) ---------- */
  const bar = el("button", { type: "button", class: "cart-bar", hidden: true, onclick: () => openCart() });
  document.body.append(bar);
  function bump() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    bar.animate([{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-4px) scale(1.03)" }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" });
  }

  /* ---------- Coșul deschis: produse, ridicare/livrare, date, trimitere ---------- */
  const drawer = el("dialog", { class: "cart-dialog", "aria-labelledby": "cart-title" });
  document.body.append(drawer);
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.close(); });
  let mode = tableNo ? "masa" : "ridicare";
  const who = store.get(KEY.who) || { nume: "", telefon: "", adresa: "" };

  function openCart() { renderCart(); drawer.showModal(); }

  function renderCart(message) {
    const state = openState();
    const head = el("div", { class: "sheet-head" },
      el("h2", { id: "cart-title", text: "Coșul tău" }),
      el("button", { type: "button", class: "close-button", "aria-label": "Închide coșul", onclick: () => drawer.close(), text: "×" }));
    if (!cart.length) {
      const last = store.get(KEY.last);
      drawer.replaceChildren(el("div", { class: "cart-body" }, head,
        el("p", { class: "cart-empty", text: "Coșul e gol. Apasă + lângă ce-ți place din meniu." }),
        last ? el("button", { type: "button", class: "button button-outline", onclick: () => { cart = last.map((x) => ({ ...x })); saveCart(); renderCart(); } }, "Comandă din nou ce ai luat data trecută") : null,
        el("a", { class: "button button-dark", href: document.querySelector("#meniu") ? "#meniu" : "./", onclick: () => drawer.close() }, "Vezi meniul")));
      return;
    }
    const lines = el("ul", { class: "cart-lines" }, cart.map((item, i) => el("li", { class: "cart-line" },
      el("div", { class: "cart-line-text" },
        el("strong", { text: item.nume }),
        item.optiuni.length ? el("span", { text: item.optiuni.map((o) => o.nume).join(", ") }) : null),
      el("div", { class: "qty", role: "group", "aria-label": "Cantitate " + item.nume },
        el("button", { type: "button", "aria-label": item.cant > 1 ? "Mai puțin" : "Scoate din coș", onclick: () => { item.cant -= 1; if (!item.cant) cart.splice(i, 1); saveCart(); renderCart(); }, text: item.cant > 1 ? "−" : "×" }),
        el("output", { class: "qty-value", text: item.cant }),
        el("button", { type: "button", "aria-label": "Mai mult", onclick: () => { item.cant = Math.min(20, item.cant + 1); saveCart(); renderCart(); }, text: "+" })),
      el("span", { class: "cart-line-price", text: lei(unitPrice(item) * item.cant) }),
    )));

    const modes = [["ridicare", "Ridic din local"]];
    if (C.livrare?.activ) modes.push(["livrare", "Livrare"]);
    if (tableNo) modes.unshift(["masa", "La masa " + tableNo]);
    if (!modes.some(([key]) => key === mode)) mode = modes[0][0];
    const modeSwitch = el("fieldset", { class: "mode-switch" }, el("legend", { class: "sr-only", text: "Cum primești comanda" }),
      modes.map(([key, label]) => el("label", {},
        el("input", { type: "radio", name: "mod", value: key, checked: key === mode, onchange: () => { mode = key; renderCart(); } }),
        el("span", { text: label }))));

    const sub = subtotal();
    const fee = mode === "livrare" ? C.livrare.taxa || 0 : 0;
    const short = mode === "livrare" && C.livrare.minim && sub < C.livrare.minim ? C.livrare.minim - sub : 0;
    const eta = mode === "livrare" ? C.livrare.minute : C.ridicare?.minute;
    const field = (name, label, attrs = {}) => el("label", { class: "field" }, el("span", { text: label }),
      el("input", { name, value: who[name] || "", oninput: (e) => { who[name] = e.target.value; store.set(KEY.who, who); }, ...attrs }));
    const form = el("form", { class: "cart-form", novalidate: true },
      mode !== "masa" ? field("nume", "Prenume", { autocomplete: "given-name", required: true, maxlength: 40 }) : null,
      mode !== "masa" ? field("telefon", "Telefon", { type: "tel", autocomplete: "tel", inputmode: "tel", required: true, maxlength: 16, placeholder: "07xx xxx xxx" }) : null,
      mode === "livrare" ? field("adresa", `Adresa de livrare (${C.livrare.zona})`, { autocomplete: "street-address", required: true, maxlength: 140 }) : null,
      el("label", { class: "field" }, el("span", { text: "Observații (opțional)" }), el("textarea", { name: "obs", rows: 2, maxlength: 200 })),
      el("dl", { class: "cart-sum" },
        el("div", {}, el("dt", { text: "Produse" }), el("dd", { text: lei(sub) })),
        mode === "livrare" ? el("div", {}, el("dt", { text: "Livrare" }), el("dd", { text: lei(fee) })) : null,
        el("div", { class: "cart-total" }, el("dt", { text: "Total" }), el("dd", { text: lei(sub + fee) }))),
      short ? el("p", { class: "order-note", text: `Livrarea pornește de la ${lei(C.livrare.minim)}. Mai adaugă ${lei(short)}.` }) : null,
      !state.open ? el("p", { class: "order-note is-closed", text: `Acum suntem închiși. Comanda o pregătim ${state.next}.` }) : null,
      el("p", { class: "cart-meta", text: (mode === "masa" ? "Plătești la masă." : (C.plata || "Plătești la primire.")) + (eta && state.open ? ` Gata în aproximativ ${eta} de minute de la confirmare.` : "") }),
      message ? el("p", { class: "order-error", role: "alert", text: message }) : null,
      el("button", { class: "button button-dark cart-send", disabled: Boolean(short) }, `Trimite comanda · ${lei(sub + fee)}`),
      !live && !C.prezentare ? el("p", { class: "order-note", text: "Mod demonstrație: comanda nu pleacă la local. O vezi în panou.html, în acest browser." }) : null,
    );
    form.addEventListener("submit", (e) => { e.preventDefault(); send(form, { sub, fee, state }); });
    drawer.replaceChildren(el("div", { class: "cart-body" }, head, lines, modeSwitch, form));
  }

  /* ---------- Trimiterea ---------- */
  // Mod prezentare: coșul merge, dar comanda nu pleacă; clientul e trimis la telefon.
  function showSoon(total) {
    drawer.replaceChildren(el("div", { class: "cart-body" },
      el("div", { class: "sheet-head" },
        el("h2", { id: "cart-title", text: "Comenzile online pornesc în curând" }),
        el("button", { type: "button", class: "close-button", "aria-label": "Închide", onclick: () => drawer.close(), text: "×" })),
      el("p", { class: "cart-meta", text: `Până atunci, sună-ne și spune ce ai ales${C.telefon ? " la " + C.telefon : ""}. Coșul tău (${lei(total)}) rămâne salvat.` }),
      C.tel ? el("a", { class: "button button-dark", href: C.tel }, "Sună acum") : null,
      el("button", { type: "button", class: "button button-outline", onclick: () => renderCart() }, "Înapoi la coș"),
    ));
  }

  async function send(form, { sub, fee, state }) {
    if (C.prezentare) return showSoon(sub + fee);
    const data = Object.fromEntries(new FormData(form));
    const phone = (data.telefon || "").replace(/[\s.-]/g, "");
    if (mode !== "masa") {
      if (!data.nume?.trim()) return renderCart("Scrie prenumele, ca să știm pe cine strigăm.");
      if (!/^(\+?40|0)7\d{8}$/.test(phone)) return renderCart("Scrie un număr de mobil valid, de forma 07xx xxx xxx.");
      if (mode === "livrare" && !data.adresa?.trim()) return renderCart("Scrie adresa unde livrăm.");
    }
    const order = {
      tip: mode, masa: mode === "masa" ? tableNo : null,
      nume: (data.nume || "").trim(), telefon: phone, adresa: mode === "livrare" ? data.adresa.trim() : "",
      observatii: (data.obs || "").trim(), pentru: state.open ? "acum" : state.next,
      produse: cart.map(({ id, nume, pret, optiuni, cant }) => ({ id, nume, pret, optiuni, cant })),
      subtotal: sub, taxa: fee, total: sub + fee,
    };
    const button = form.querySelector(".cart-send");
    button.disabled = true;
    button.textContent = "Se trimite…";
    try {
      const result = await api.place(order);
      store.set(KEY.last, cart);
      store.set(KEY.current, { id: result.id, cod: result.cod, total: order.total, tip: order.tip, la: Date.now() });
      cart = [];
      saveCart();
      showStatus();
    } catch {
      renderCart("Comanda nu a plecat. Verifică internetul și încearcă din nou sau sună-ne.");
    }
  }

  /* ---------- Starea comenzii, pentru client ---------- */
  const STEPS = [["noua", "Trimisă"], ["acceptata", "Acceptată"], ["gata", "Gata"], ["finalizata", "Predată"]];
  let timer;
  async function showStatus() {
    const current = store.get(KEY.current);
    if (!current) return;
    let info = { stare: "noua" };
    try { info = (await api.status(current.id)) || info; } catch {}
    const refused = info.stare === "refuzata";
    const at = STEPS.findIndex(([key]) => key === info.stare);
    const ready = info.stare === "gata" ? (current.tip === "livrare" ? "Comanda e pe drum." : current.tip === "masa" ? "Vine la masă." : "Te așteptăm la bar.") : "";
    drawer.replaceChildren(el("div", { class: "cart-body" },
      el("div", { class: "sheet-head" },
        el("h2", { id: "cart-title", text: "Comanda " + current.cod }),
        el("button", { type: "button", class: "close-button", "aria-label": "Închide", onclick: () => drawer.close(), text: "×" })),
      refused
        ? el("p", { class: "order-error", text: "Localul nu poate prelua comanda acum. Sună-ne și găsim o soluție." })
        : el("ol", { class: "status-steps" }, STEPS.map(([key, label], i) => el("li", { class: i < at ? "is-done" : i === at ? "is-now" : "", "aria-current": i === at ? "step" : null, text: label }))),
      info.minute && info.stare === "acceptata" ? el("p", { class: "status-eta", text: `Gata în aproximativ ${info.minute} de minute.` }) : null,
      ready ? el("p", { class: "status-eta", text: ready }) : null,
      el("p", { class: "cart-meta", text: `Total ${lei(current.total)}. Dacă ai o întrebare, sună-ne${C.telefon ? " la " + C.telefon : ""}.` }),
      C.tel ? el("a", { class: "button button-outline", href: C.tel }, "Sună la local") : null,
      ["finalizata", "refuzata"].includes(info.stare)
        ? el("button", { type: "button", class: "button button-dark", onclick: () => { store.set(KEY.current, null); drawer.close(); render(); } }, "Gata, mulțumesc")
        : null,
    ));
    render(info.stare);
    if (!drawer.open) drawer.showModal();
    clearTimeout(timer);
    if (!["finalizata", "refuzata"].includes(info.stare)) timer = setTimeout(() => drawer.open && showStatus(), live ? 15000 : 4000);
  }

  /* ---------- Bara de jos: coșul sau starea comenzii ---------- */
  function render(stare) {
    const current = store.get(KEY.current);
    const n = count();
    if (current && !n && Date.now() - current.la < 6 * 3600e3) {
      const label = { noua: "trimisă", acceptata: "acceptată", gata: "gata", finalizata: "predată", refuzata: "refuzată" }[stare] || "în lucru";
      bar.replaceChildren(el("span", { text: "Comanda " + current.cod }), el("strong", { text: label }));
      bar.onclick = showStatus;
      bar.hidden = false;
    } else {
      bar.replaceChildren(el("span", { text: n === 1 ? "1 produs" : n + " produse" }), el("strong", { text: lei(subtotal()) + " · Vezi coșul" }));
      bar.onclick = () => openCart();
      bar.hidden = !n;
    }
    document.body.classList.toggle("has-cart-bar", !bar.hidden);
  }

  /* ---------- Unde pleacă comanda: Supabase sau, în demo, acest browser ---------- */
  const code = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => a[b % a.length]).join(""); };
  const api = live ? {
    async call(fn, body) {
      const r = await fetch(C.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: C.supabaseCheie, ...(C.supabaseCheie.startsWith("eyJ") ? { Authorization: "Bearer " + C.supabaseCheie } : {}) },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    place(order) { return this.call("plaseaza_comanda", { p: order }); },
    status(id) { return this.call("stare_comanda", { p_id: id }); },
  } : {
    async place(order) {
      const all = store.get(KEY.demo) || [];
      const row = { ...order, id: crypto.randomUUID(), cod: code(), stare: "noua", minute: null, creat: new Date().toISOString() };
      all.unshift(row);
      store.set(KEY.demo, all.slice(0, 50));
      return { id: row.id, cod: row.cod };
    },
    async status(id) { const row = (store.get(KEY.demo) || []).find((o) => o.id === id); return row && { stare: row.stare, minute: row.minute }; },
  };

  decorate();
  render();
  if (store.get(KEY.current)) api.status(store.get(KEY.current).id).then((info) => render(info?.stare)).catch(() => {});
  addEventListener("storage", (e) => { if (e.key === KEY.demo && drawer.open && store.get(KEY.current)) showStatus(); });
})();
