"""Creează variantele mici și AVIF pentru fotografiile din folderImagini (date-site.json).

Rulează după ce adaugi sau schimbi o fotografie:
    pip install pillow
    python sursa/optimizeaza_imagini.py
    python sursa/genereaza.py

Pentru fiecare foto.webp rezultă foto-480.webp, foto-960.webp (doar dacă originalul e mai lat),
foto.avif și variantele -480/-960 în AVIF. genereaza.py le găsește singur și scrie srcset.
"""

import json
from pathlib import Path

from PIL import Image

_ROOT = Path(__file__).resolve().parent.parent
_DATA = json.loads((_ROOT / "sursa" / "date-site.json").read_text(encoding="utf-8"))
FOLDER = _ROOT / _DATA.get("folderImagini", "assets/img/caf/")
WIDTHS = (480, 960)


def save(image, path, fmt, source_width):
    # Pozele mici (sub 1000 px) se văd mărite pe ecran, deci le comprimăm mult mai puțin.
    small = source_width <= 1000
    if fmt == "AVIF":
        image.save(path, "AVIF", quality=88 if small else 62, speed=6)
    else:
        image.save(path, "WEBP", quality=92 if small else 80, method=6)


for source in sorted(FOLDER.glob("*.webp")):
    if source.stem.rsplit("-", 1)[-1].isdigit():
        continue  # este deja o variantă
    original = Image.open(source).convert("RGB")
    save(original, source.with_suffix(".avif"), "AVIF", original.width)
    for width in WIDTHS:
        if original.width <= width * 1.15:
            continue
        height = round(original.height * width / original.width)
        small = original.resize((width, height), Image.LANCZOS)
        for suffix, fmt in ((".webp", "WEBP"), (".avif", "AVIF")):
            save(small, source.with_name(f"{source.stem}-{width}{suffix}"), fmt, original.width)
    print("gata:", source.name)
