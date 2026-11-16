"""Propunerile pentru patron: voucher pe e-mail, roata norocului și specialitățile casei.

Apar pe demo.html. Pe index.html apar doar când "extra.activ" e true în date-site.json.
"""
import json
import math


def build(data, esc, image, frame):
    extra = data["extra"]
    products = {p["nume"]: p for category in data["meniu"] for p in category["produse"]}

    def price(product):
        value = product["pret"]
        return ((f"{value:.2f}" if value % 1 else f"{value:g}").replace(".", ",") + " lei") if value is not None else "La cerere"

    # --- Specialitățile casei: carusel legat de derulare, cu ingrediente care plutesc ---
    spec = extra["specialitati"]
    shapes = {
        "bob": '<svg viewBox="0 0 20 28"><ellipse cx="10" cy="14" rx="9" ry="13" fill="#5a3520"/><path d="M10 2c-4 6 4 18 0 24" stroke="#2a160c" stroke-width="2" fill="none"/></svg>',
        "frunza": '<svg viewBox="0 0 30 20"><path d="M1 10C8-1 24-1 29 10 24 21 8 21 1 10Z" fill="#6f9e5a"/><path d="M3 10h24" stroke="#4d7a3c" stroke-width="1.4"/></svg>',
        "lime": '<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="#9cc45a"/><circle cx="15" cy="15" r="11" fill="#d5ea9a"/><path d="M15 4v22M4 15h22M7 7l16 16M23 7 7 23" stroke="#9cc45a" stroke-width="1.2"/></svg>',
        "firimitura": '<svg viewBox="0 0 20 16"><path d="M2 8 6 2l8 1 5 6-4 6-9 0Z" fill="#d9a860"/><path d="M6 6l6 1" stroke="#b07f3e" stroke-width="1"/></svg>',
        "rosie": '<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="#c8402e"/><circle cx="15" cy="15" r="10" fill="#e0614a"/><circle cx="11" cy="13" r="1.6" fill="#f3d27a"/><circle cx="19" cy="13" r="1.6" fill="#f3d27a"/><circle cx="15" cy="19" r="1.6" fill="#f3d27a"/></svg>',
        "cascaval": '<svg viewBox="0 0 30 22"><path d="M2 20 28 20 28 8 2 20Z" fill="#f2c14e"/><circle cx="20" cy="15" r="2" fill="#d9a12e"/><circle cx="25" cy="12" r="1.3" fill="#d9a12e"/></svg>',
    }
    # Unde stau ingredientele în jurul pozei: unghi, distanță (din rază), mărime, adâncime.
    spots = [(-55, 1.14, 52, 1.4), (-5, 1.2, 34, .7), (40, 1.12, 46, 1.2), (145, 1.16, 40, .9), (200, 1.1, 56, 1.5), (250, 1.22, 32, .6)]
    cards = []
    for i, name in enumerate(spec["produse"]):
        product = products.get(name)
        if not product:
            continue
        key = spec.get("imagini", {}).get(name) or product.get("imagine")
        illustration = ""
        if key in data["imagini"]:
            photo = f'<div class="special-photo">{image(key, sizes="(min-width: 900px) 46vw, 80vw")}</div>'
            if data["imagini"][key].get("ilustrativa"):
                illustration = '<small class="special-caption">Imagine ilustrativă</small>'
        else:
            photo = f'<div class="special-photo is-type" aria-hidden="true"><span>{esc(product["nume"])}</span></div>'
        floaters = "".join(
            f'<span class="floater" style="--a:{a}deg;--r:{r};--s:{size}px;--z:{z};--k:{k}">{shapes[kind]}</span>'
            for k, (kind, (a, r, size, z)) in enumerate(zip(spec.get("ingrediente", {}).get(name, []), spots))
        )
        tint = spec.get("tente", {}).get(name, "#c08a5e")
        story = spec.get("povesti", {}).get(name, {})
        kicker = f'<span class="special-kicker">{esc(story["eticheta"])}</span>' if story.get("eticheta") else ""
        cards.append(
            f'<li class="special" style="--i:{i};--tint-own:{esc(tint)}" data-tint="{esc(tint)}">'
            f'<div class="special-visual">{photo}'
            f'{illustration}</div>'
            f'<div class="special-copy">{kicker}<h3>{esc(product["nume"])}</h3>'
            f'<p>{esc(story.get("text") or product["descriere"])}</p><span class="price">{price(product)}</span></div></li>'
        )
    steam = (
        '<svg class="steam" viewBox="0 0 120 160" aria-hidden="true">'
        '<path d="M40 150c-14-20 14-34 0-56s12-36 0-60"/><path d="M62 150c-14-22 16-36 0-60s12-34 2-62"/>'
        '<path d="M84 150c-12-18 12-32 0-52s10-30 0-52"/></svg>'
    )
    dots = "".join(f'<span style="--i:{i}"></span>' for i in range(len(cards)))
    specials = (
        '<section class="specials" id="specialitati" aria-labelledby="specials-title">'
        f'<div class="specials-track" style="--count:{len(cards)}"><div class="specials-sticky"><div class="shell specials-inner">'
        f'<div class="specials-head"><h2 id="specials-title">{esc(spec["titlu"])}</h2><p>{esc(spec["text"])}</p></div>'
        f'<div class="specials-stage">{steam}<ul class="special-list">{"".join(cards)}</ul></div>'
        f'<div class="specials-dots" aria-hidden="true">{dots}</div>'
        '</div></div></div></section>'
    )

    if set(extra.get("sectiuni", ())) == {"specialitati"}:
        return {"afterMenu": specials}

    # --- Roata: 12 felii (fiecare premiu de două ori, față în față), becuri, cuie, ac și butuc ---
    wheel = extra["roata"]
    prizes = wheel["premii"]
    n = len(prizes) * 2
    step = 360 / n
    C, R = 120, 100

    def point(radius, angle):
        rad = math.radians(angle - 90)
        return C + radius * math.cos(rad), C + radius * math.sin(rad)

    slices, pegs, lights = [], [], []
    for i in range(n):
        prize = prizes[i % len(prizes)]
        x0, y0 = point(R, i * step)
        x1, y1 = point(R, (i + 1) * step)
        mid = (i + .5) * step
        slices.append(
            f'<path class="slice s{i % 3}" data-slice="{i}" d="M{C} {C}L{x0:.2f} {y0:.2f}A{R} {R} 0 0 1 {x1:.2f} {y1:.2f}Z"/>'
            f'<text class="t{i % 3}" transform="rotate({mid:.1f} {C} {C}) translate({C} {C - R + 12}) rotate(90)" dominant-baseline="middle">{esc(prize["scurt"])}</text>'
        )
        px, py = point(R - 3, i * step)
        pegs.append(f'<circle class="peg" cx="{px:.2f}" cy="{py:.2f}" r="2.4"/>')
    for i in range(24):
        lx, ly = point(110, i * 15 + 7.5)
        lights.append(f'<circle class="bulb b{i % 2}" cx="{lx:.2f}" cy="{ly:.2f}" r="3.1"/>')
    wheel_svg = (
        '<svg class="wheel" viewBox="0 0 240 240" aria-hidden="true">'
        f'<circle class="wheel-frame" cx="{C}" cy="{C}" r="117"/>'
        f'<g class="wheel-lights">{"".join(lights)}</g>'
        f'<g class="wheel-disc">{"".join(slices)}'
        f'{"".join(pegs)}</g>'
        f'<circle class="wheel-edge" cx="{C}" cy="{C}" r="{R}"/>'
        f'<circle class="wheel-hub" cx="{C}" cy="{C}" r="25"/>'
        f'<text class="wheel-hub-text" x="{C}" y="{C + 1}" text-anchor="middle" dominant-baseline="middle">{esc(data["texte"]["logo"]["mare"])}</text>'
        '<g class="wheel-pointer"><path d="M120 30 L109 6 Q120 -2 131 6 Z"/><circle cx="120" cy="9" r="3.2"/></g>'
        '</svg>'
    )

    voucher = extra["voucher"]
    mail = extra.get("email", {})
    config = {
        "prizes": [p["nume"] for p in prizes],
        "wheelValid": wheel["valabilitate"],
        "prefix": data["texte"]["logo"]["mare"],
        "supabaseUrl": mail.get("supabaseUrl", ""),
        "supabaseKey": mail.get("supabaseCheie", ""),
    }
    offers = (
        '<section class="section offers" id="oferte" aria-labelledby="offers-title"><div class="shell">'
        '<div class="offer-grid">'
        f'<article class="offer offer-wheel"><h3 id="offers-title">{esc(wheel["titlu"])}</h3><p>{esc(wheel["text"])}</p>'
        f'<button type="button" class="wheel-wrap" aria-label="Învârte roata">{wheel_svg}</button>'
        '<button type="button" class="button button-dark" data-spin>Învârte roata</button>'
        '<p class="wheel-hint">Sau apasă direct pe roată.</p>'
        '<p class="wheel-result" role="status"></p></article>'
        '</div></div>'
        f'<script id="extra-config" type="application/json">{json.dumps(config, ensure_ascii=False)}</script>'
        '</section>'
    )

    # --- Fereastra cu voucherul: e-mail, cod de confirmare, voucher ---
    modal = (
        '<dialog class="welcome" aria-labelledby="welcome-title">'
        '<form method="dialog" class="welcome-close"><button aria-label="Închide">×</button></form>'
        f'<div class="welcome-photo" aria-hidden="true">{image(extra["voucher"].get("imagine", "vEspresso"), sizes="(min-width: 700px) 320px, 100vw")}</div>'
        '<div class="welcome-body">'
        f'<h2 id="welcome-title">{esc(voucher["titlu"])}</h2>'
        # Pasul 1: adresa de e-mail
        '<form class="welcome-step" data-step="email" novalidate>'
        f'<p>{esc(voucher["text"])}</p>'
        '<label for="welcome-email">Adresa de e-mail</label>'
        '<input id="welcome-email" type="email" autocomplete="email" required placeholder="nume@exemplu.ro">'
        f'<label class="welcome-consent"><input type="checkbox" required> <span>{esc(voucher["acord"])}</span></label>'
        '<button class="button button-dark">Trimite-mi codul</button>'
        '<p class="welcome-error" role="alert"></p></form>'
        # Pasul 2: codul primit
        '<form class="welcome-step" data-step="code" hidden novalidate>'
        '<p>Ți-am trimis un cod de 6 cifre la <strong class="welcome-to"></strong>. Scrie-l aici.</p>'
        '<label for="welcome-code">Codul de confirmare</label>'
        '<input id="welcome-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>'
        '<button class="button button-dark">Confirmă</button>'
        '<p class="welcome-demo" hidden></p>'
        '<button type="button" class="welcome-back">Altă adresă de e-mail</button>'
        '<p class="welcome-error" role="alert"></p></form>'
        # Pasul 3: voucherul
        '<div class="welcome-step" data-step="voucher" hidden>'
        '<p>Gata! Arată voucherul la bar, la prima vizită.</p>'
        '<div class="ticket"><div class="ticket-qr" aria-hidden="true"></div>'
        '<div class="ticket-info"><span class="ticket-label">Espresso din partea casei</span>'
        '<strong class="ticket-code"></strong><span class="ticket-until"></span></div></div>'
        f'<small>{esc(voucher["conditii"])}</small></div>'
        '</div></dialog>'
        '<button type="button" class="voucher-pill" hidden>Voucherul tău ☕</button>'
    )
    return {"offers": offers, "afterMenu": specials, "modal": modal}
