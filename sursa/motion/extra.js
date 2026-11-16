// Voucherul pe e-mail, roata norocului și cardul de fidelitate.
// Codul pe e-mail trece prin Supabase; roata și ștampilele se țin pe telefon (localStorage), deci sunt pentru demonstrație.
import qrcode from "qrcode-generator";

const config = JSON.parse(document.getElementById("extra-config")?.textContent || "null");
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* fără memorie: merge doar acum */ } }
};
const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
};
const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const human = (iso) => new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long" });
const code = () => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => letters[b % letters.length]).join("");
};

function setupWelcome() {
  const dialog = document.querySelector("dialog.welcome");
  const pill = document.querySelector(".voucher-pill");
  if (!dialog || !config) return;
  const steps = Object.fromEntries([...dialog.querySelectorAll(".welcome-step")].map((el) => [el.dataset.step, el]));
  const live = Boolean(config.supabaseUrl && config.supabaseKey);
  let email = "";
  let demoCode = "";

  function go(name) {
    for (const [key, el] of Object.entries(steps)) el.hidden = key !== name;
    steps[name].querySelector("input")?.focus();
  }
  function fail(step, message) {
    steps[step].querySelector(".welcome-error").textContent = message;
  }
  function open() {
    if (!dialog.open) dialog.showModal();
  }

  function showVoucher(voucher) {
    const qr = qrcode(0, "M");
    qr.addData(`${config.prefix} VOUCHER ESPRESSO ${voucher.code} PANA LA ${voucher.until}`);
    qr.make();
    const ticket = steps.voucher;
    ticket.querySelector(".ticket-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    ticket.querySelector(".ticket-code").textContent = config.prefix + "-" + voucher.code;
    ticket.querySelector(".ticket-until").textContent = "Valabil până pe " + human(voucher.until);
    go("voucher");
    pill.hidden = false;
  }

  // Supabase trimite codul și îl verifică pe server; fără chei, pagina rulează în mod demonstrație.
  async function auth(path, body) {
    const response = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/auth/v1/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseKey },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || "eroare");
    return data;
  }

  steps.email.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = steps.email.querySelector("input[type=email]");
    const consent = steps.email.querySelector("input[type=checkbox]");
    fail("email", "");
    if (!input.checkValidity() || !input.value.trim()) return fail("email", "Scrie o adresă de e-mail validă.");
    if (!consent.checked) return fail("email", "Bifează acordul, ca să-ți putem trimite codul.");
    email = input.value.trim().toLowerCase();
    const button = steps.email.querySelector("button");
    button.disabled = true;
    try {
      if (live) {
        await auth("otp", { email, create_user: true });
      } else {
        demoCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
        const note = steps.code.querySelector(".welcome-demo");
        note.textContent = `Mod demonstrație: în varianta finală codul vine pe e-mail. Codul tău este ${demoCode}.`;
        note.hidden = false;
      }
      steps.code.querySelector(".welcome-to").textContent = email;
      go("code");
    } catch {
      fail("email", "Nu am putut trimite codul acum. Încearcă din nou în câteva minute.");
    } finally {
      button.disabled = false;
    }
  });

  steps.code.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = steps.code.querySelector("input").value.trim();
    fail("code", "");
    if (!/^\d{6}$/.test(token)) return fail("code", "Codul are 6 cifre.");
    const button = steps.code.querySelector("button");
    button.disabled = true;
    try {
      if (live) {
        const session = await auth("verify", { type: "email", email, token });
        // Un singur voucher pe adresă: contul trebuie să fie nou.
        const created = Date.parse(session.user?.created_at || 0);
        if (Date.now() - created > 30 * 60 * 1000) {
          return fail("code", "Pe adresa asta s-a dat deja un voucher. Ne vedem la o cafea!");
        }
      } else if (token !== demoCode) {
        return fail("code", "Codul nu se potrivește. Verifică e-mailul.");
      }
      const voucher = { code: code(), until: isoDay(day(30)), email };
      store.set("caf-voucher", voucher);
      showVoucher(voucher);
    } catch {
      fail("code", "Codul nu e bun sau a expirat. Cere altul.");
    } finally {
      button.disabled = false;
    }
  });

  dialog.querySelector(".welcome-back").addEventListener("click", () => go("email"));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    if (!store.get("caf-voucher")) store.set("caf-voucher-amanat", Date.now());
  });
  pill.addEventListener("click", open);
  // Butonul apare doar după prima secțiune, ca să nu acopere butoanele de sus.
  const togglePill = () => pill.classList.toggle("is-visible", scrollY > innerHeight * .7);
  addEventListener("scroll", togglePill, { passive: true });
  togglePill();

  const saved = store.get("caf-voucher");
  if (saved) {
    showVoucher(saved);
    return;
  }
  // Fereastra apare singură la intrare; dacă a închis-o, nu mai insistăm o săptămână.
  const later = store.get("caf-voucher-amanat");
  // Fereastra apare abia după ce omul a derulat cât un ecran, ca să vadă întâi prima pagină.
  if (!later || Date.now() - later > 7 * 864e5) {
    const onScroll = () => {
      if (scrollY < innerHeight * .9) return;
      removeEventListener("scroll", onScroll);
      setTimeout(open, 600);
    };
    addEventListener("scroll", onScroll, { passive: true });
  }
}

function setupWheel() {
  const wrap = document.querySelector(".wheel-wrap");
  const button = document.querySelector("[data-spin]");
  const disc = document.querySelector(".wheel-disc");
  const pointer = document.querySelector(".wheel-pointer");
  const result = document.querySelector(".wheel-result");
  const hint = document.querySelector(".wheel-hint");
  if (!wrap || !disc || !config) return;
  const count = config.prizes.length * 2;
  const slice = 360 / count;
  let angle = 0;
  let busy = false;

  const turn = (deg) => disc.setAttribute("transform", `rotate(${deg} 120 120)`);
  // Felia aflată sub ac pentru un unghi dat.
  const under = (deg) => Math.floor((((360 - (deg % 360)) % 360) + 360) % 360 / slice);

  function announce(spin) {
    result.innerHTML = "";
    const prize = document.createElement("strong");
    prize.textContent = config.prizes[spin.index];
    const detail = document.createElement("span");
    const left = document.createElement("span");
    left.className = "wheel-left";
    detail.textContent = `Cod ${config.prefix}-${spin.code}. Arată ecranul la bar. ${config.wheelValid}`;
    const kicker = document.createElement("span");
    kicker.className = "wheel-kicker";
    kicker.textContent = "Ai câștigat";
    const ticket = document.createElement("span");
    ticket.className = "wheel-code";
    ticket.textContent = `${config.prefix}-${spin.code}`;
    detail.textContent = `Arată codul la bar. ${config.wheelValid}`;
    result.append(kicker, prize, ticket, left, detail);
    const update = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const minutes = Math.max(0, Math.ceil((midnight - Date.now()) / 60000));
      left.textContent = `Mai ai ${Math.floor(minutes / 60)} h ${minutes % 60} min.`;
    };
    update();
    clearInterval(announce.timer);
    announce.timer = setInterval(update, 30000);
  }

  function highlight(sliceIndex) {
    disc.querySelectorAll(".slice").forEach((el) => el.classList.toggle("is-win", Number(el.dataset.slice) === sliceIndex));
    wrap.classList.add("is-won");
  }

  function lock() {
    wrap.disabled = true;
    button.disabled = true;
    button.textContent = "Revino mâine";
    if (hint) hint.hidden = true;
  }

  // Boabe de cafea care sar din centru la câștig.
  // Boabe de cafea care sar dintr-un punct (roata sau mijlocul ecranului).
  function burst(host, amount = 26, reach = 110) {
    if (calm) return;
    for (let i = 0; i < amount; i++) {
      const bean = document.createElement("span");
      bean.className = "bean" + (i % 3 === 0 ? " is-cream" : "");
      host.append(bean);
      const dir = Math.random() * Math.PI * 2;
      const dist = reach * (.8 + Math.random());
      const x = Math.cos(dir) * dist;
      const y = Math.sin(dir) * dist;
      const turn = (Math.random() - .5) * 720;
      bean.animate([
        { transform: "translate(0, 0) rotate(0deg) scale(.4)", opacity: 1 },
        { transform: `translate(${x * .8}px, ${y * .8 - 30}px) rotate(${turn * .7}deg) scale(1)`, opacity: 1, offset: .6 },
        { transform: `translate(${x}px, ${y + 60}px) rotate(${turn}deg) scale(.9)`, opacity: 0 }
      ], { duration: 1100 + Math.random() * 700, delay: Math.random() * 120, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" }).finished.then(() => bean.remove());
    }
  }

  // Premiul, mare pe tot ecranul.
  let stage;
  function reveal(spin) {
    if (!stage) {
      stage = document.createElement("dialog");
      stage.className = "prize-stage";
      stage.setAttribute("aria-labelledby", "prize-name");
      stage.innerHTML = '<div class="prize-rays" aria-hidden="true"></div><div class="prize-burst" aria-hidden="true"></div>'
        + '<div class="prize-card"><p class="prize-kicker">Ai câștigat</p><h2 id="prize-name" class="prize-name"></h2>'
        + '<p class="prize-code"></p><p class="prize-time"></p>'
        + '<form method="dialog"><button class="button button-light">Super, mulțumesc!</button></form></div>';
      document.body.append(stage);
      stage.addEventListener("click", (event) => { if (event.target === stage) stage.close(); });
    }
    const name = stage.querySelector(".prize-name");
    name.innerHTML = "";
    config.prizes[spin.index].split(" ").forEach((word, i) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.style.setProperty("--i", i);
      name.append(span, " ");
    });
    stage.querySelector(".prize-code").textContent = `Cod ${config.prefix}-${spin.code} · arată ecranul la bar`;
    stage.querySelector(".prize-time").textContent = result.querySelector(".wheel-left")?.textContent.replace("Mai ai", "Valabil azi, mai ai") || config.wheelValid;
    stage.showModal();
    if (calm) return;
    stage.querySelector(".prize-card").animate(
      [{ transform: "scale(.6)", opacity: 0, filter: "blur(10px)" }, { transform: "scale(1.04)", opacity: 1, filter: "blur(0)", offset: .7 }, { transform: "scale(1)" }],
      { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
    name.querySelectorAll("span").forEach((span, i) => span.animate(
      [{ transform: "translateY(60%) rotate(4deg)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 650, delay: 250 + i * 110, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }
    ));
    const host = stage.querySelector(".prize-burst");
    burst(host, 46, Math.min(innerWidth, innerHeight) * .42);
    setTimeout(() => stage.open && burst(host, 24, Math.min(innerWidth, innerHeight) * .32), 650);
  }

  function tick() {
    pointer.animate([{ transform: "rotate(-22deg)" }, { transform: "rotate(0deg)" }], { duration: 160, easing: "cubic-bezier(.2,.8,.3,1)" });
  }

  const saved = store.get("caf-roata");
  if (saved && saved.date === isoDay(day())) {
    const sliceIndex = saved.slice ?? saved.index;
    angle = 360 - (sliceIndex + .5) * slice;
    turn(angle);
    highlight(sliceIndex);
    announce(saved);
    lock();
  }

  function spin() {
    if (busy || wrap.disabled) return;
    busy = true;
    const index = crypto.getRandomValues(new Uint32Array(1))[0] % config.prizes.length;
    // Fiecare premiu apare de două ori pe roată; alegem una din felii.
    const sliceIndex = index + (Math.random() < .5 ? 0 : config.prizes.length);
    const jitter = (Math.random() - .5) * slice * .6;
    const target = 360 - (sliceIndex + .5) * slice + jitter;
    const start = angle;
    const end = start + 360 * 6 + ((target - start) % 360 + 360) % 360;
    const record = { index, slice: sliceIndex, code: code(), date: isoDay(day()) };
    result.textContent = "";
    button.disabled = true;
    wrap.classList.remove("is-won");
    disc.querySelectorAll(".slice").forEach((el) => el.classList.remove("is-win"));

    const finish = () => {
      angle = end;
      turn(angle);
      wrap.classList.remove("is-spinning");
      store.set("caf-roata", record);
      highlight(sliceIndex);
      announce(record);
      burst(wrap);
      setTimeout(() => reveal(record), calm ? 0 : 450);
      lock();
      busy = false;
    };
    if (calm) return finish();

    wrap.classList.add("is-spinning");
    // Pornește repede și încetinește lung, ca o roată adevărată; acul tresare la fiecare cui.
    const duration = 7000;
    const t0 = performance.now();
    let last = under(start);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = start + (end - start) * eased;
      turn(current);
      const slot = under(current);
      if (slot !== last) { last = slot; tick(); }
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
  }

  wrap.addEventListener("click", spin);
  button.addEventListener("click", spin);
}

// Specialitățile: produsele trec prin centru legate de derulare. Pe calculator vin de jos în sus,
// pe telefon din dreapta spre stânga. Lumina din fundal ia culoarea produsului din centru.
function setupSpecials() {
  const section = document.querySelector(".specials");
  if (!section) return;
  const track = section.querySelector(".specials-track");
  const sticky = section.querySelector(".specials-sticky");
  const items = [...section.querySelectorAll(".special")];
  const dots = [...section.querySelectorAll(".specials-dots span")];
  if (items.length < 2) return;
  section.classList.add("is-scrolly");
  const last = items.length - 1;
  const parts = items.map((item) => ({
    item,
    visual: item.querySelector(".special-visual"),
    photo: item.querySelector(".special-photo"),
    copy: item.querySelector(".special-copy"),
    giant: item.querySelector(".special-giant"),
    floaters: [...item.querySelectorAll(".floater")],
    tint: hex(item.dataset.tint)
  }));
  const settle = (t) => {
    const x = Math.min(1, Math.max(0, (t - .25) / .5));
    return x * x * (3 - 2 * x);
  };
  function hex(value) {
    const n = parseInt((value || "#c08a5e").slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  let queued = false;

  function draw() {
    queued = false;
    const wide = innerWidth >= 900;
    const box = track.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -box.top / (box.height - innerHeight)));
    const raw = progress * last;
    const base = Math.min(last - 1, Math.floor(raw));
    const focus = base + settle(raw - base);
    const size = parts[0].photo.offsetWidth || 300;
    parts.forEach(({ item, visual, photo, copy, floaters, giant }, i) => {
      const d = i - focus;
      const far = Math.min(Math.abs(d), 1.6);
      const move = wide
        ? `translateY(${d * size * 1.02}px) scale(${1 - far * .42})`
        : `translateX(${d * Math.min(innerWidth * .62, 380)}px) translateY(${far * 30}px) scale(${1 - far * .4})`;
      visual.style.transform = move;
      visual.style.opacity = String(Math.max(0, 1 - far * (wide ? .85 : .55)));
      visual.style.filter = !calm && far > .05 ? `blur(${(far * 2.5).toFixed(1)}px)` : "none";
      item.style.zIndex = String(10 - Math.round(far * 4));
      photo.style.rotate = calm ? "0deg" : `${d * -24}deg`;
      floaters.forEach((el) => {
        const depth = Number(el.style.getPropertyValue("--z")) || 1;
        el.style.translate = `0 ${d * depth * -60}px`;
        el.style.opacity = String(Math.max(0, 1 - Math.abs(d) * 2.2));
      });
      // Numele uriaș alunecă mai repede decât poza, în sens invers, și se stinge când pleacă.
      if (giant) {
        giant.style.transform = `translate(calc(-50% + ${d * -55}vw), -50%)`;
        giant.style.opacity = String(Math.max(0, 1 - Math.abs(d) * 1.6));
      }
      copy.style.opacity = String(Math.max(0, 1 - Math.abs(d) * 2.4));
      copy.style.transform = wide ? `translateY(${d * -40}px)` : `translateX(${d * Math.min(innerWidth * .62, 380)}px)`;
      copy.style.pointerEvents = Math.abs(d) < .5 ? "auto" : "none";
    });
    // Culoarea luminii: amestec între produsele vecine.
    const lo = Math.floor(focus), hi = Math.min(last, lo + 1), t = focus - lo;
    const mix = parts[lo].tint.map((c, k) => Math.round(c + (parts[hi].tint[k] - c) * t));
    section.style.setProperty("--tint", `rgb(${mix.join(" ")})`);
    sticky.style.setProperty("--glow-x", wide ? "30%" : "50%");
    const active = Math.round(focus);
    dots.forEach((dot, i) => dot.classList.toggle("is-on", i === active));
  }
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request);
  draw();
}

setupWelcome();
setupSpecials();
setupWheel();
