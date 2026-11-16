"""Regenerează pagina statică după editarea fișierului date-site.json."""

import hashlib
import html
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote, urljoin

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
DATA = json.loads((SOURCE / "date-site.json").read_text(encoding="utf-8"))
IMG = DATA.get("folderImagini", "assets/img/caf/")
TEXT = DATA["texte"]
DAY_LABELS = dict(zip(
    ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
    ("Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"),
))


def esc(value):
    return html.escape(str(value), quote=True)


def js(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def rich(text):
    """Text din date: „|” devine rând nou, iar cuvintele cu cratimă (într-un) nu se rup."""
    out = html.escape(str(text), quote=True).replace("|", "<br> ")
    return re.sub(r"(?<![\w-])(\w+-\w+)(?![\w-])", r'<span class="nowrap">\1</span>', out)


def logo():
    return f'<span>{esc(TEXT["logo"]["mare"])}</span><small>{esc(TEXT["logo"]["mic"])}</small>'


def location_card(place, index):
    """Cardul unei locații. Prima e locația principală: are reper, butoane de contact și harta din linkuri."""
    slug = re.sub(r"[^a-z0-9]+", "-", place["oras"].lower().translate(str.maketrans("ăâîșțş ţ", "aaisstst"))).strip("-")
    slug += f"-{index + 1}"
    primary = index == 0
    landmark = f'<span>{esc(place["reper"])}</span>' if primary and place.get("reper") else ""
    chips = f'<span class="chips">{contact_buttons(DATA["linkuri"])}</span>' if primary else ""
    src = (DATA["linkuri"].get("harta") if primary else "") or map_embed(place)
    short = TEXT["logo"]["mare"]
    return (
        f'<article class="location-card" aria-labelledby="loc-{slug}">'
        f'<h3 id="loc-{slug}">{esc(place.get("nume", place["oras"]))}</h3>'
        '<dl class="location-facts">'
        f'<div><dt>Adresă</dt><dd>{esc(place["adresa"])}, {esc(place["oras"])}{landmark}</dd></div>'
        f'<div><dt>Program</dt><dd>{esc(schedule_label(place.get("program")))}</dd></div>'
        f'<div><dt>Telefon</dt><dd>{phone_link(place.get("telefon"))}{chips}</dd></div>'
        '</dl>'
        f'<a class="button button-dark" href="{esc(maps("dir", place["cautareHarta"]))}">Direcții {arrow("M6 18 18 6M7 6h11v11")}</a>'
        '<figure class="location-map" data-lenis-prevent>'
        f'<iframe src="{esc(src)}" title="Hartă: {esc(short)} {esc(place["oras"])}, {esc(place["adresa"])}" loading="lazy" '
        'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></figure></article>'
    )


def arrow(path):
    return (
        '<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        f'<path d="{path}"/></svg>'
    )


def maps(action, query):
    parameter = "destination" if action == "dir" else "query"
    return f"https://www.google.com/maps/{action}/?api=1&{parameter}={quote(query)}"


def schedule_label(schedule):
    if not schedule:
        return "Confirmă telefonic"
    lines = []
    for entry in schedule:
        days = entry["zile"]
        label = "Zilnic" if set(days) == set(DAY_LABELS) else ", ".join(DAY_LABELS[day] for day in days)
        lines.append(f'{label}, {entry["deschide"]}–{entry["inchide"]}')
    return " · ".join(lines)


def variants(file_name, width, ext):
    """Lista srcset pentru fișierele create de optimizeaza_imagini.py (doar cele existente)."""
    stem = file_name.rsplit(".", 1)[0]
    items = []
    for size in (480, 960):
        if (ROOT / IMG / f"{stem}-{size}{ext}").exists():
            items.append(f"{IMG}{stem}-{size}{ext} {size}w")
    if (ROOT / IMG / f"{stem}{ext}").exists():
        items.append(f"{IMG}{stem}{ext} {width}w")
    return ", ".join(items)


def image(key, *, hero=False, sizes="(min-width: 900px) 45vw, 100vw"):
    item = DATA["imagini"][key]
    alt = item["alt"]
    if DATA["fotografiiIlustrative"]:
        alt = "Imagine ilustrativă. " + alt
    loading = 'fetchpriority="high"' if hero else 'loading="lazy" decoding="async"'
    avif = variants(item["fisier"], item["latime"], ".avif")
    webp = variants(item["fisier"], item["latime"], ".webp") if item["fisier"].endswith(".webp") else ""
    img = (
        f'<img src="{esc(IMG + item["fisier"])}"' + (f' srcset="{esc(webp)}" sizes="{sizes}"' if webp else "")
        + f' width="{item["latime"]}" height="{item["inaltime"]}" alt="{esc(alt)}" {loading}>'
    )
    if not avif:
        return img
    return f'<picture><source type="image/avif" srcset="{esc(avif)}" sizes="{sizes}">{img}</picture>'


def frame(key, extra="", sizes="(min-width: 900px) 45vw, 100vw"):
    return f'<div class="image-frame depth{extra}">{image(key, sizes=sizes)}</div>'


def figure(key, extra=""):
    # Fiecare fotografie își păstrează forma: pătrată sau lată.
    item = DATA["imagini"][key]
    shape = " is-wide" if item["latime"] > item["inaltime"] else ""
    return (
        f'<li class="wood-figure{shape}{extra}"><div class="image-frame">'
        f'{image(key, sizes="(min-width: 900px) 46vh, 78vw")}</div></li>'
    )


def gallery_tile(key, index):
    item = DATA["imagini"][key]
    caption = item["titlu"]
    if DATA["fotografiiIlustrative"]:
        if DATA.get("eticheteIlustrative", True):
            caption += " · Imagine ilustrativă"
    return (
        f'<a class="gallery-item g{index} image-frame depth" href="{esc(IMG + item["fisier"])}" '
        f'data-caption="{esc(caption)}" aria-label="Mărește imaginea. {esc(caption)}">'
        f'{image(key, sizes="(min-width: 640px) 60vw, 50vw")}<span class="gallery-caption">{esc(caption)}</span></a>'
    )


def menu_tab(category, index):
    category_id = esc(category["id"])
    return (
        f'<button type="button" class="menu-tab" role="tab" id="fila-{category_id}" '
        f'aria-controls="meniu-{category_id}" aria-selected="{"true" if index == 0 else "false"}" '
        f'tabindex="{0 if index == 0 else -1}" data-category="{category_id}">'
        f'<span class="tab-index">{index + 1:02d}</span>'
        f'<span class="tab-name">{esc(category["nume"])}</span>'
        f'<span class="tab-count">{len(category["produse"])}</span></button>'
    )


def menu_panel(category):
    category_id = esc(category["id"])
    cards = []
    for product in category["produse"]:
        price = product["pret"]
        amount = ((f"{price:.2f}" if price % 1 else f"{price:g}").replace(".", ",") + " lei") if price is not None else "La cerere"
        badge = '<span class="favorite">Preferata casei</span>' if product.get("preferat") else ""
        key = product.get("imagine")
        if key in DATA["imagini"]:
            visual = f'<div class="dish-photo">{image(key, sizes="(min-width: 900px) 30vw, 50vw")}{badge}</div>'
        else:
            # Fără fotografie: numele scris mare, pe un fond cald.
            visual = f'<div class="dish-photo dish-type"><span class="dish-type-name" aria-hidden="true">{esc(product["nume"])}</span>{badge}</div>'
        cards.append(
            f'<li class="dish-card">{visual}<div class="dish-info"><div class="dish-line">'
            f'<h4>{esc(product["nume"])}</h4><span class="price">{amount}</span></div>'
            f'<p>{esc(product["descriere"])}</p></div></li>'
        )
    return (
        f'<section class="menu-panel" role="tabpanel" id="meniu-{category_id}" aria-labelledby="fila-{category_id}">'
        f'<h3 class="menu-panel-title">{esc(category["nume"])}</h3><ul class="dish-grid">{"".join(cards)}</ul></section>'
    )


FILTERS = tuple(tuple(f) for f in DATA["filtre"]) if "filtre" in DATA else (("fara-cafeina", "Fără cafeină"), ("rece", "Rece"), ("dulce", "Dulce"), ("preferat", "Preferata casei"))
DOODLES = {
    "cana": '<svg class="doodle doodle-cup" viewBox="0 0 120 100"><path pathLength="1" d="M22 40c20 2 40 2 58 0 1 10 1 18-2 26-6 14-48 14-54 0-3-8-3-16-2-26Z"/><path pathLength="1" d="M80 46c16-2 16 20-2 18"/><path pathLength="1" d="M8 84c30 8 74 8 104-1"/><path pathLength="1" d="M42 30c-7-8 7-12 0-21M58 30c-7-8 7-12 0-21"/></svg>',
    "lamaie": '<svg class="doodle doodle-lemon" viewBox="0 0 100 100"><path pathLength="1" d="M50 8a42 42 0 1 1-.1 0Z"/><path pathLength="1" d="M50 18a32 32 0 1 1-.1 0Z"/><path pathLength="1" d="M50 18v64M18 50h64M27 27l46 46M73 27 27 73"/></svg>',
}


def story_receipt():
    """Bonul de casă: antetul cafenelei, câteva rânduri din poveste cu puncte până la preț, totalul și un cod de bare."""
    bon = TEXT["poveste"].get("bon")
    if not bon:
        return ""
    place = DATA["locatii"][0]
    line = lambda left, right, cls="": (
        f'<li class="rc-line{cls}"><span>{esc(left)}</span><i aria-hidden="true"></i><span>{esc(right)}</span></li>'
    )
    bars = "".join(f'<span style="--w:{w}px"></span>' for w in (2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 4, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 4, 1, 2, 1))
    return (
        '<figure class="receipt" aria-label="Povestea, ca un bon de casă">'
        f'<p class="rc-brand"><strong>{esc(TEXT["logo"]["mare"])}</strong><span>{esc(TEXT["logo"]["mic"])}</span></p>'
        f'<p class="rc-head">{esc(place["adresa"])}, {esc(place["oras"])}<br>Deschis: {esc(bon["data"])}</p>'
        f'<ol class="rc-lines">{"".join(line(l, r) for l, r in bon["linii"])}</ol>'
        f'<p class="rc-total"><span>{esc(bon["total"][0])}</span><span>{esc(bon["total"][1])}</span></p>'
        f'<p class="rc-foot">{esc(bon["subsol"])}</p>'
        f'<div class="rc-bars" aria-hidden="true">{bars}</div>'
        '</figure>'
    )


def product_id(product):
    """Identificator stabil pentru coș: din nume, fără diacritice."""
    plain = product["nume"].lower().translate(str.maketrans("ăâîșşțţ", "aaisstt"))
    return product.get("id") or re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def small_src(key):
    item = DATA["imagini"][key]
    stem = item["fisier"].rsplit(".", 1)[0]
    small = ROOT / IMG / f"{stem}-480.webp"
    return IMG + (small.name if small.exists() else item["fisier"])


# Mărimi pe produs ("marimi": [{"nume": "Mare", "pret": 34.99}, {"nume": "Family 1500 g", "pret": 79.99}]):
# pe tablă apare prețul primei mărimi, celelalte trec în descriere; în coș se alege mărimea.
PRODUCT_GROUPS = {}
for _category in DATA["meniu"]:
    for _p in _category["produse"]:
        sizes = _p.get("marimi")
        if not sizes or _p.get("_marimiGata"):
            continue
        base = sizes[0]["pret"]
        _p["pret"] = base
        extra = " · ".join(f'{v["nume"]}: ' + (f'{v["pret"]:.2f}' if v["pret"] % 1 else f'{v["pret"]:g}').replace(".", ",") + " lei" for v in sizes[1:])
        if extra:
            _p["descriere"] = (_p.get("descriere", "").rstrip() + " " + extra + ".").strip()
        key = "marime-" + product_id(_p)
        DATA.setdefault("comenzi", {}).setdefault("grupuri", {})[key] = {"titlu": "Mărime", "tip": "una",
            "variante": [{"nume": v["nume"], "pret": round(v["pret"] - base, 2)} for v in sizes]}
        PRODUCT_GROUPS[product_id(_p)] = [key]
        _p["_marimiGata"] = True


def menu_board():
    filters = "".join(
        f'<button type="button" class="board-filter" data-filter="{key}" aria-pressed="false">{label}</button>'
        for key, label in FILTERS
    )
    groups = []
    n = 0
    for category in DATA["meniu"]:
        items = []
        for product in category["produse"]:
            price = product["pret"]
            amount = ((f"{price:.2f}" if price % 1 else f"{price:g}").replace(".", ",") + " lei") if price is not None else "La cerere"
            labels = list(product.get("etichete", [])) + (["preferat"] if product.get("preferat") else [])
            key = product.get("imagine")
            has_photo = key in DATA["imagini"]
            thumb = f'<span class="board-thumb" aria-hidden="true">{image(key, sizes="52px")}</span>' if has_photo else ""
            star = '<span class="board-fav">★ preferata casei</span>' if product.get("preferat") else ""
            items.append(
                f'<li class="board-item" data-pid="{esc(product_id(product))}" data-tags="{" ".join(labels)}" style="view-transition-name: produs-{n}">'
                f'<div class="board-line">{thumb}<h4>{esc(product["nume"])}</h4><span class="board-dots" aria-hidden="true"></span>'
                f'<span class="board-price">{amount}</span></div><p>{esc(product["descriere"])}{star}</p></li>'
            )
            n += 1
        groups.append(
            f'<section class="board-group" data-category="{esc(category["id"])}"><h3>{esc(category["nume"])}</h3>'
            f'<ul class="board-list">{"".join(items)}</ul></section>'
        )
    return (
        '<div class="chalkboard">'
        + "".join(DOODLES.values())
        + f'<div class="board-filters" role="group" aria-label="Filtrează meniul">{filters}</div>'
        + f'<div class="board-cols">{"".join(groups)}</div>'
        + '<p class="board-empty" hidden>Nimic pe filtrul ăsta. Încearcă altul.</p>'
        + '<p class="sr-only" role="status" aria-live="polite" data-board-status></p>'
        + "</div>"
    )


def review(item, index, total):
    # Textul se afișează exact cum l-a scris autorul.
    name = item["autor"]
    initials = "".join(part[0] for part in name.replace(".", "").split()[:2]).upper()
    text = item.get("text") or item.get("rezumat")
    size = " is-long" if len(text) > 170 else " is-short" if len(text) < 40 else ""
    stars = int(item.get("stele") or 0)
    star = "★"
    rating = (
        f'<span class="review-stars" role="img" aria-label="{stars} din 5 stele">'
        + star * stars + '<span class="dim">' + star * (5 - stars) + '</span></span>'
        if stars else ""
    )
    author = esc(name)
    if item.get("url"):
        author = f'<a href="{esc(item["url"])}">{author}</a>'
    return (
        f'<article class="review-card{size}">{rating}'
        f'<p class="review-text">{esc(text)}</p>'
        f'<footer class="review-person"><span class="review-avatar" aria-hidden="true">{esc(initials)}</span>'
        f'<span class="review-name">{author}</span></footer></article>'
    )


def contact_links(links):
    channels = []
    if links.get("whatsapp"):
        channels.append(f'<a href="https://wa.me/{esc(re.sub(r"[^0-9]", "", links["whatsapp"]))}">WhatsApp</a>')
    if links.get("email"):
        channels.append(f'<a href="mailto:{esc(links["email"])}">E-mail</a>')
    for key in ("instagram", "facebook"):
        if links.get(key):
            channels.append(f'<a href="{esc(links[key])}">{key.capitalize()}</a>')
    return '<ul class="contact-links">' + "".join(f"<li>{channel}</li>" for channel in channels) + "</ul>"


def contact_buttons(links):
    """Butoanele de lângă telefon. Apar doar când datele sunt completate."""
    buttons = []
    if links.get("whatsapp"):
        number = re.sub(r"[^0-9]", "", links["whatsapp"])
        buttons.append(f'<a class="chip" href="https://wa.me/{esc(number)}">WhatsApp</a>')
    if links.get("email"):
        buttons.append(f'<a class="chip" href="mailto:{esc(links["email"])}">E-mail</a>')
    return "".join(buttons)


def phone_link(number):
    if not number:
        return '<span class="todo">Telefon [DE COMPLETAT]</span>'
    return f'<a class="location-phone" href="tel:{re.sub(r"[^0-9+]", "", number)}">{esc(number)}</a>'


def map_embed(place):
    if place.get("latitudine") is not None:
        query = f'{place["latitudine"]},{place["longitudine"]}'
    else:
        query = place["cautareHarta"]
    return f"https://www.google.com/maps?q={quote(query)}&z=16&output=embed&hl=ro"


def shop_schema(place, *, primary):
    shop = {
        "@type": "CafeOrCoffeeShop",
        "name": f'{DATA["brand"]} {place["oras"]}',
        "address": {
            "@type": "PostalAddress",
            "streetAddress": place["adresa"],
            "addressLocality": place["oras"],
            "addressRegion": place.get("judet") or DATA["locatii"][0].get("judet", ""),
            "addressCountry": "RO",
        },
        "hasMap": maps("search", place["cautareHarta"]),
    }
    if primary:
        shop["description"] = DATA["description"]
    if place.get("telefon"):
        shop["telephone"] = place["telefon"]
    if place.get("latitudine") is not None:
        shop["geo"] = {"@type": "GeoCoordinates", "latitude": place["latitudine"], "longitude": place["longitudine"]}
    if place.get("program"):
        shop["openingHoursSpecification"] = [
            {"@type": "OpeningHoursSpecification", "dayOfWeek": row["zile"], "opens": row["deschide"], "closes": row["inchide"]}
            for row in place["program"]
        ]
    return shop


dorohoi = DATA["locatii"][0]
botosani = DATA["locatii"][1] if len(DATA["locatii"]) > 1 else DATA["locatii"][0]
links = DATA["linkuri"]
video = DATA["video"]
video_id = quote(video["youtube"], safe="")
rating = DATA.get("evaluareGoogle")
social = links["instagram"] or links["facebook"]
social_label = "Instagram" if links["instagram"] else "Facebook"
illustrative = DATA["fotografiiIlustrative"]
site_url = DATA["publicUrl"].rstrip("/") + "/" if DATA["publicUrl"] else ""
map_search = maps("search", dorohoi["cautareHarta"])
map_query = quote(dorohoi["cautareHarta"])
map_url = links["harta"] or f"https://www.google.com/maps?q={map_query}&z=17&output=embed"
share = DATA["imagini"]["share"]
shops = [shop_schema(place, primary=i == 0) for i, place in enumerate(DATA["locatii"])]
main_shop = shops[0]
schema = {"@context": "https://schema.org", "@graph": shops}
if site_url:
    for shop in shops:
        shop.update(url=site_url, hasMenu=site_url + "#meniu")
        if not illustrative:
            shop["image"] = urljoin(site_url, IMG + share["fisier"])
profiles = [links[key] for key in ("instagram", "facebook") if links.get(key)]
if profiles:
    main_shop["sameAs"] = profiles

THEME = DATA.get("tema") or {}


def theme_head():
    """Tema locului (culori, decor): un stil și, opțional, un script, încărcate după celelalte."""
    out = ""
    if THEME.get("css"):
        out += f'<link rel="stylesheet" href="{THEME["css"]}?v={hashlib.sha1((ROOT / THEME["css"]).read_bytes()).hexdigest()[:8]}">'
    if THEME.get("js"):
        out += f'<script defer src="{THEME["js"]}?v={hashlib.sha1((ROOT / THEME["js"]).read_bytes()).hexdigest()[:8]}"></script>'
    return out


nav = (("meniu", "Meniu"), ("atelier", TEXT.get("navGalerie", "Poveste")), ("locatii", "Locații"), ("contact", "Contact"))
values = {
    "themeHead": theme_head(),
    "favicon": IMG + "favicon.png",
    "themeColor": THEME.get("culoare", "#1F1612"),
    "colorScheme": THEME.get("schema", "dark"),
    "title": esc(TEXT["titluPagina"]),
    "logo": logo(),
    "logoShort": esc(TEXT["logo"]["mare"]),
    "heroTitle": rich(TEXT["hero"]),
    "heroKeys": esc(",".join(TEXT.get("heroCuvinteAurii", []))),
    "storyTitle": rich(TEXT["poveste"]["titlu"]),
    "storyLead": rich(TEXT["poveste"]["lead"]),
    "storyText": rich(TEXT["poveste"]["text"]),
    "galleryTitle": rich(TEXT["galerie"]["titlu"]),
    "galleryText": rich(TEXT["galerie"]["text"]),
    "menuTitle": rich(TEXT["meniu"]),
    "reviewsTitle": rich(TEXT["recenzii"]),
    "locationsTitle": rich(TEXT["locatii"]),
    "footerText": rich(TEXT["subsol"]),
    "menuPageTitle": esc(TEXT["paginaMeniu"]["titlu"]),
    "menuPageDescription": esc(TEXT["paginaMeniu"]["descriere"]),
    "menuPageStory": esc(TEXT["paginaMeniu"]["linkPoveste"]),
    "cityD": esc(dorohoi["oras"]),
    "locationCards": "".join(location_card(place, i) for i, place in enumerate(DATA["locatii"])),
    "brand": esc(DATA["brand"]),
    "description": esc(DATA["description"]),
    "shareUrl": esc(urljoin(site_url, IMG + share["fisier"])),
    "shareWidth": share["latime"],
    "shareHeight": share["inaltime"],
    "shareAlt": esc(share["alt"]) + (" · Imagine ilustrativă" if illustrative else ""),
    "canonical": f'<link rel="canonical" href="{esc(site_url)}"><meta property="og:url" content="{esc(site_url)}">' if site_url else "",
    "schema": js(schema),
    "schedule": js(dorohoi["program"]),
    "atelier": esc(DATA["atelier"]),
    "deschidere": esc(DATA["deschidere"]),
    "navigation": "".join(f'<a href="#{key}">{label}</a>' for key, label in nav),
    "directionsD": esc(maps("dir", dorohoi["cautareHarta"])),
    "directionsB": esc(maps("dir", botosani["cautareHarta"])),
    "mapSearch": esc(map_search),
    "mapUrl": esc(map_url),
    "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
    "videoCredit": esc(video["credit"]),
    "heroImage": image("hero", hero=True, sizes="100vw").removeprefix("<picture>").removesuffix("</picture>"),
    "heroDesktopAvif": esc(variants(DATA["imagini"]["hero"]["fisier"], DATA["imagini"]["hero"]["latime"], ".avif")),
    "heroMobileAvif": esc(variants(DATA["imagini"]["hero"]["mobil"], DATA["imagini"]["hero"]["latimeMobil"], ".avif")),
    "heroMobileSet": esc(variants(DATA["imagini"]["hero"]["mobil"], DATA["imagini"]["hero"]["latimeMobil"], ".webp")),
    "heroDesktop": esc(IMG + DATA["imagini"]["hero"]["fisier"]),
    "heroMobile": esc(IMG + DATA["imagini"]["hero"]["mobil"]),
    "heroMobileWidth": DATA["imagini"]["hero"]["latimeMobil"],
    "heroMobileHeight": DATA["imagini"]["hero"]["inaltimeMobil"],
    "reviewsUrl": esc(links["recenzii"] or map_search),
    "reviewsRating": (
        f'<p class="reviews-rating"><strong>{esc(rating["scor"])}</strong><span>din 5 · {esc(rating["numar"])} de păreri</span></p>'
        if rating else ""
    ),
    "addressD": esc(dorohoi["adresa"]),
    "addressB": esc(botosani["adresa"]),
    "landmark": esc(dorohoi["reper"]),
    "phone": esc(dorohoi["telefon"]),
    "tel": "tel:" + re.sub(r"[^\d+]", "", dorohoi["telefon"]),
    "scheduleLabelD": esc(schedule_label(dorohoi["program"])),
    "scheduleLabelB": esc(schedule_label(botosani["program"])),
    "heroIllustration": '<figcaption class="hero-credit">Imagine ilustrativă</figcaption>' if illustrative and DATA.get("eticheteIlustrative", True) else "",
    "arrowDown": arrow("M12 4v15m-6-6 6 6 6-6"),
    "arrowOut": arrow("M6 18 18 6M7 6h11v11"),
    "menuNotice": "",
    "reviews": "".join(review(item, i, len([r for r in DATA["recenzii"] if r])) for i, item in enumerate([r for r in DATA["recenzii"] if r], start=1)),
    "writeReview": esc(links.get("scrieRecenzie") or links["recenzii"] or map_search),
    "arrowLeft": arrow("M19 12H5m6-6-6 6 6 6"),
    "arrowRight": arrow("M5 12h14m-6-6 6 6-6 6"),
    "contactLinks": contact_links(links),
    "contactButtons": contact_buttons(links),
    "phoneD": phone_link(dorohoi["telefon"]),
    "phoneB": phone_link(botosani.get("telefon")),
    "mapD": esc(links["harta"] or map_embed(dorohoi)),
    "mapB": esc(map_embed(botosani)),
    "storyLarge": frame(TEXT["poveste"]["imagineMare"], " story-large", "(min-width: 900px) 40vw, 80vw"),
    "storyRings": story_receipt(),
    "storySmall": frame(TEXT["poveste"]["imagineMica"], " story-small", "(min-width: 900px) 24vw, 45vw"),
    "storyThird": frame(TEXT["poveste"]["imagineTrei"], " story-third", "(min-width: 900px) 16vw, 30vw") if TEXT["poveste"].get("imagineTrei") else "",
    "storyYear": f'<span class="story-year" aria-hidden="true">{esc(TEXT["poveste"].get("an", ""))}</span>' if TEXT["poveste"].get("an") else "",
    "storyKeys": esc(",".join(TEXT["poveste"].get("cuvinteCheie", []))),
    "woodImages": "".join(figure(key, f" w{i}") for i, key in enumerate(TEXT["galerie"]["imagini"])),
    "woodWindow": (
        '<div class="wood-window" aria-hidden="true"><div class="ww-photos">'
        + "".join(
            f'<div class="ww-frame" style="--i:{i};--w:{DATA["imagini"][key]["latime"]};--h:{DATA["imagini"][key]["inaltime"]};'
            f'--rot:{(-2.2, 1.8, -1.2, 2.6, -1.6)[i % 5]}deg;--dx:{(0, 26, -22, 18, -10)[i % 5]}px;--dy:{(0, -14, 12, -8, 16)[i % 5]}px">'
            f'<div class="ww-photo">{image(key, sizes="(min-width: 900px) 800px, 90vw")}</div>'
            f'<p class="ww-cap">{esc(DATA["imagini"][key].get("titlu", ""))}</p></div>'
            for i, key in enumerate(TEXT["galerie"]["imagini"]))
        + '</div><div class="ww-shade"></div>'
        + f'<div class="ww-copy"><p class="ww-title">{rich(TEXT["galerie"]["titlu"])}</p><p class="ww-text">{rich(TEXT["galerie"]["text"])}</p></div>'
        + '</div>'
    ),
    "menuTabs": "".join(menu_tab(row, i) for i, row in enumerate(DATA["meniu"])),
    "menuPanels": "".join(menu_panel(row) for row in DATA["meniu"]),
    "menuBoard": menu_board(),
    "socialLink": f'<a class="text-link" href="{esc(social)}">Urmărește-ne pe {social_label} {arrow("M6 18 18 6M7 6h11v11")}</a>' if social else "",
    "photoCredits": '<p class="photo-credits">Fotografii din ' + " · ".join(
        f'<a href="{esc(source["url"])}">{esc(source["nume"])}</a>' for source in DATA["surseFoto"]
    ) + '</p>' if DATA["surseFoto"] else "",
    "year": date.today().year,
    # Versiunea din adresă se schimbă odată cu fișierul, așa că browserele nu mai țin stilul vechi.
    "vCss": hashlib.sha1((ROOT / "assets/css/style.css").read_bytes()).hexdigest()[:8],
    "vJs": hashlib.sha1((ROOT / "assets/js/main.js").read_bytes()).hexdigest()[:8],
    "vMotion": hashlib.sha1((ROOT / "assets/js/motion.js").read_bytes()).hexdigest()[:8],
}
from extra_sectiuni import build as build_extras

extras = build_extras(DATA, esc, image, frame) if DATA["extra"]["activ"] else {}
extra_head = (
    '<link rel="stylesheet" href="assets/css/extra.css?v='
    + hashlib.sha1((ROOT / "assets/css/extra.css").read_bytes()).hexdigest()[:8] + '">'
)
extra_script = (
    '<script defer src="assets/js/extra.js?v='
    + hashlib.sha1((ROOT / "assets/js/extra.js").read_bytes()).hexdigest()[:8] + '"></script>'
)


ORDERS = DATA.get("comenzi") or {}



def order_config():
    place = DATA["locatii"][0]
    return js({
        "produse": {
            product_id(p): {"nume": p["nume"], "pret": p["pret"], "cat": c["id"], "descriere": p.get("descriere", ""), "grupuri": PRODUCT_GROUPS.get(product_id(p), [])}
            for c in DATA["meniu"] for p in c["produse"]
        },
        "grupuri": ORDERS.get("grupuri", {}),
        "categorii": ORDERS.get("categorii", {}),
        "ridicare": ORDERS.get("ridicare", {}),
        "livrare": ORDERS.get("livrare", {"activ": False}),
        "exemple": ORDERS.get("exemple", False),
        "program": place.get("program", []),
        "telefon": place.get("telefon", ""),
        "tel": ("tel:" + re.sub(r"[^\d+]", "", place["telefon"])) if place.get("telefon") else "",
        "supabaseUrl": ORDERS.get("supabaseUrl", ""),
        "supabaseCheie": ORDERS.get("supabaseCheie", ""),
        "prezentare": ORDERS.get("prezentare", False),
        "plata": ORDERS.get("plata", ""),
    })


def version(path):
    return hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:8]


def order_parts(on):
    """Coșul de comenzi: stilul în <head> și scripturile la final. Gol când comenzile sunt oprite."""
    if not on or not ORDERS:
        return {"orderHead": "", "orderScripts": ""}
    return {
        "orderHead": f'<link rel="stylesheet" href="assets/css/comenzi.css?v={version("assets/css/comenzi.css")}">',
        "orderScripts": f'<script id="comenzi-config" type="application/json">{order_config()}</script>'
                        f'<script defer src="assets/js/comenzi.js?v={version("assets/js/comenzi.js")}"></script>',
    }


def with_extras(base, on, demo=False):
    out = dict(base)
    # "extra.sectiuni" alege ce apare pe site: "specialitati", "roata", "voucher". Lipsă = toate.
    parts = set(DATA["extra"].get("sectiuni") or ["specialitati", "roata", "voucher"]) if not demo else {"specialitati", "roata", "voucher"}
    out.update({
        "extraHead": (('<meta name="robots" content="noindex">' if demo else "") + extra_head) if on else "",
        "extraModal": extras["modal"] if on and "voucher" in parts else "",
        "extraAfterMenu": extras["afterMenu"] if on and "specialitati" in parts else "",
        "extraOffers": extras["offers"] if on and "roata" in parts else "",
        "extraScripts": extra_script if on else "",
    })
    out.update(order_parts(ORDERS.get("activ") or demo))
    if demo:
        out["canonical"] = ""
    return out


template = (SOURCE / "pagina.html").read_text(encoding="utf-8")
live = with_extras(values, DATA["extra"]["activ"])
page = re.sub(r"\{\{(\w+)\}\}", lambda match: str(live[match[1]]), template)
if not [r for r in DATA["recenzii"] if r]:
    # Fără recenzii: secțiunea nu apare deloc.
    page = re.sub(r'\s*<section class="section reviews".*?</section>', "", page, flags=re.S)
(ROOT / "index.html").write_text(page, encoding="utf-8", newline="\n")
# --- Meniul pentru mese (meniu.html), deschis din codul QR de pe cartonaș ---
def qr_item(product):
    price = product["pret"]
    amount = ((f"{price:.2f}" if price % 1 else f"{price:g}").replace(".", ",") + " lei") if price is not None else "La cerere"
    key = product.get("imagine")
    if key in DATA["imagini"]:
        thumb = f'<div class="qm-thumb">{image(key, sizes="76px")}</div>'
    else:
        thumb = f'<div class="qm-thumb is-letter" aria-hidden="true">{esc(product["nume"][0])}</div>'
    fav = '<span class="qm-fav">Preferata casei</span>' if product.get("preferat") else ""
    return (
        f'<li class="qm-item" data-pid="{esc(product_id(product))}">{thumb}<h3>{esc(product["nume"])}{fav}</h3>'
        f'<span class="price">{amount}</span><p>{esc(product["descriere"])}</p></li>'
    )


menu_values = dict(values, **order_parts(ORDERS.get("activ")))
menu_values.update({
    "vMenuCss": hashlib.sha1((ROOT / "assets/css/meniu.css").read_bytes()).hexdigest()[:8],
    "cover": image(TEXT["paginaMeniu"].get("imagine", "hero"), hero=True, sizes="100vw"),
    "chips": "".join(f'<a class="qm-chip" href="#{esc(c["id"])}">{esc(c["nume"])}</a>' for c in DATA["meniu"]),
    "sections": "".join(
        f'<section class="qm-section" id="{esc(c["id"])}"><h2>{esc(c["nume"])}</h2>'
        f'<ul class="qm-list">{"".join(qr_item(p) for p in c["produse"])}</ul></section>'
        for c in DATA["meniu"]
    ),
})
menu_template = (SOURCE / "meniu.html").read_text(encoding="utf-8")
(ROOT / "meniu.html").write_text(re.sub(r"\{\{(\w+)\}\}", lambda m: str(menu_values[m[1]]), menu_template), encoding="utf-8", newline="\n")

# Panoul de comenzi pentru local (panou.html, neindexat).
if ORDERS:
    panel_values = dict(values, brand=esc(DATA["brand"]), orderConfig=order_config(),
                        vOrderCss=version("assets/css/comenzi.css"), vPanelJs=version("assets/js/panou.js"),
                        demoLink='<a href="demo.html">demo.html</a>' if not ORDERS.get("activ") else '<a href="./">site</a>')
    panel_template = (SOURCE / "panou.html").read_text(encoding="utf-8")
    (ROOT / "panou.html").write_text(re.sub(r"\{\{(\w+)\}\}", lambda m: str(panel_values[m[1]]), panel_template), encoding="utf-8", newline="\n")

# Cartonașul de masă pentru tipar (print/card-masa.html); codul QR îl face sursa/qr.py.
qr_path = ROOT / "assets/img/qr-meniu.svg"
if qr_path.exists():
    card_values = dict(menu_values, qr=qr_path.read_text(encoding="utf-8"))
    card_template = (SOURCE / "card-masa.html").read_text(encoding="utf-8")
    (ROOT / "print").mkdir(exist_ok=True)
    (ROOT / "print/card-masa.html").write_text(re.sub(r"\{\{(\w+)\}\}", lambda m: str(card_values[m[1]]), card_template), encoding="utf-8", newline="\n")


robots = "User-agent: *\nAllow: /\n"
if site_url:
    robots += f"Sitemap: {site_url}sitemap.xml\n"
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    sitemap += f"<url><loc>{esc(site_url)}</loc></url><url><loc>{esc(site_url)}meniu.html</loc></url></urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8", newline="\n")
else:
    (ROOT / "sitemap.xml").unlink(missing_ok=True)
(ROOT / "robots.txt").write_text(robots, encoding="utf-8", newline="\n")
