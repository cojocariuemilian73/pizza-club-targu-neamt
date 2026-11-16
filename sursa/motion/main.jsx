import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import AnimatedContent from "./AnimatedContent.jsx";

gsap.registerPlugin(ScrollTrigger);

// Mișcare discretă: totul apare cu fade și 12px, pe o curbă care se așază lin.
const EASE = "power3.out";
const RISE = 12;

const preferences = gsap.matchMedia();
preferences.add("(prefers-reduced-motion: no-preference)", () => {
  const roots = [];

  // 2. La derulare, coperta rămâne puțin în urmă.
  gsap.to(".hero-media", {
    yPercent: 12, ease: "none",
    scrollTrigger: { trigger: ".hero-main", start: "top top", end: "bottom top", scrub: true }
  });

  // 3. Titlurile secțiunilor, cu Animated Content de la React Bits (fade + 12px).
  document.querySelectorAll("main h2").forEach((title) => {
    const html = title.innerHTML;
    const root = createRoot(title);
    root.render(
      <AnimatedContent as="span" style={{ display: "block" }} distance={RISE} duration={.9}
        ease={EASE} initialOpacity={0} threshold={.12}>
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </AnimatedContent>
    );
    roots.push({ root, title, html });
  });

  // 4. Restul conținutului apare în grupuri, la fel de discret.
  const groups = [
    ".section-intro > p:not(.eyebrow)", ".wood-head > p",
    ".wood-notes li", ".board-group", ".review-card",
    ".location-card", ".footer-grid > *"
  ];
  groups.forEach((selector) => {
    ScrollTrigger.batch(selector, {
      start: "top 90%",
      once: true,
      onEnter: (batch) => gsap.fromTo(batch, { y: RISE, opacity: 0 }, {
        y: 0, opacity: 1, duration: .9, ease: EASE, stagger: .08, clearProps: "transform,opacity"
      })
    });
  });

  // 5. Adâncime: fotografia alunecă puțin în ramă la derulare.
  document.documentElement.classList.add("has-depth");
  gsap.utils.toArray(".depth img").forEach((image) => {
    gsap.fromTo(image, { yPercent: -4 }, {
      yPercent: 4, ease: "none",
      scrollTrigger: { trigger: image.closest(".depth"), start: "top bottom", end: "bottom top", scrub: true }
    });
  });

  // 6. Derulare lină cu Lenis, doar pe dispozitivele cu mouse.
  const desktop = gsap.matchMedia();
  desktop.add("(pointer: fine) and (hover: hover)", () => {
    const lenis = new Lenis({ lerp: .12, smoothWheel: true, autoRaf: false, stopInertiaOnNavigate: true, anchors: { offset: -80 } });
    const tick = (time) => lenis.raf(time * 1000);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  });

  addEventListener("load", () => ScrollTrigger.refresh(), { once: true });

  return () => {
    desktop.revert();
    for (const { root, title, html } of roots) {
      root.unmount();
      title.innerHTML = html;
    }
    document.documentElement.classList.remove("has-depth");
    gsap.set(".hero-media, .hero-media img, .hero-copy > *, .depth img", { clearProps: "all" });
  };
});

// Efectele legate de derulare (Povestea și fereastra de la Atelier) merg și cu „animații reduse”:
// se mișcă doar cât derulează omul, deci nu pornesc singure.
const scrolly = gsap.matchMedia();
scrolly.add("(min-width: 0px)", () => {
  // 5a. (Secțiunea Poveste a fost scoasă; povestea stă acum în textul galeriei.)
  const storyParagraphs = [];
  const storyOriginal = [];

  // 5b. Atelierul: un carusel rotund. Pozele stau pe un cerc, ca pe o masă rotativă;
  // la derulare cercul se rotește, poza din față e mare și clară, celelalte stau în spate, mai mici și mai întunecate.
  const room = gsap.matchMedia();
  room.add("(min-width: 0px)", () => {
    const stage = document.querySelector(".wood-window");
    const frames = gsap.utils.toArray(".ww-frame");
    if (!stage || frames.length < 2) return;
    document.documentElement.classList.add("has-window");
    const wide = matchMedia("(min-width: 900px)");
    const count = frames.length;
    const step = 360 / count;
    const tilt = frames.map((frame) => parseFloat(getComputedStyle(frame).getPropertyValue("--rot")) || 0);
    const turn = { angle: 0 };
    const render = () => {
      const desktop = wide.matches;
      const radius = desktop ? Math.min(270, innerWidth * .14) : innerWidth * .3;
      frames.forEach((frame, i) => {
        const a = (i * step + turn.angle) * Math.PI / 180;
        const front = (Math.cos(a) + 1) / 2;            // 1 = în față, 0 = în spate
        gsap.set(frame, {
          xPercent: -50, yPercent: desktop ? -50 : 0,
          x: Math.sin(a) * radius, y: (1 - front) * (desktop ? -30 : -10),
          rotationY: Math.sin(a) * -28, rotation: tilt[i] * front * (desktop ? .6 : .4),
          scale: .52 + .48 * front, zIndex: Math.round(front * 100),
          filter: `brightness(${(.35 + .65 * front).toFixed(3)})`, transformPerspective: 1400
        });
      });
    };
    render();
    gsap.set(".ww-copy", { opacity: 1, y: 0 });

    // Caruselul se rotește pe orizontal: glisare cu degetul/mouse-ul, rotița orizontală, săgeți și tastatură.
    // Derularea în jos a paginii rămâne normală.
    const pin = stage.closest(".wood-pin");
    const photos = stage.querySelector(".ww-photos");
    const snapTo = (angle) => gsap.to(turn, { angle: Math.round(angle / step) * step, duration: .7, ease: "power3.out", onUpdate: render, overwrite: true });
    const go = (dir) => snapTo(Math.round(turn.angle / step) * step - dir * step);
    const nav = document.createElement("div");
    nav.className = "ww-nav";
    nav.innerHTML = '<button type="button" class="ww-arrow" aria-label="Poza anterioară">←</button><span class="ww-hint">Glisează</span><button type="button" class="ww-arrow" aria-label="Poza următoare">→</button>';
    pin.append(nav);
    const [prev, next] = nav.querySelectorAll("button");
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));

    let drag = null;
    const down = (e) => {
      if (e.target.closest("button") || (!wide.matches && !photos.contains(e.target))) return;
      drag = { x: e.clientX, angle: turn.angle, id: e.pointerId };
      gsap.killTweensOf(turn);
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) pin.classList.add("is-dragging");
      turn.angle = drag.angle + dx * (wide.matches ? .22 : .45);
      render();
    };
    const up = () => { if (!drag) return; drag = null; pin.classList.remove("is-dragging"); snapTo(turn.angle); };
    pin.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    addEventListener("resize", render);

    let wheelTimer;
    const wheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // derularea în jos merge mai departe
      e.preventDefault();
      gsap.killTweensOf(turn);
      turn.angle -= e.deltaX * .25;
      render();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => snapTo(turn.angle), 140);
    };
    pin.addEventListener("wheel", wheel, { passive: false });
    const key = (e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
    nav.addEventListener("keydown", key);

    return () => {
      nav.remove();
      pin.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      removeEventListener("resize", render);
      pin.removeEventListener("wheel", wheel);
      clearTimeout(wheelTimer);
      gsap.killTweensOf(turn);
      document.documentElement.classList.remove("has-window");
      gsap.set(".ww-frame", { clearProps: "transform,filter,zIndex" });
      gsap.set(".ww-shade, .ww-copy", { clearProps: "all" });
    };
  });

  ScrollTrigger.refresh();
  return () => {
    room.revert();
    storyParagraphs.forEach((p, i) => { p.innerHTML = storyOriginal[i]; });
  };
});
