"""Codul QR pentru meniul de pe mese. Rulează-l din nou după ce se schimbă domeniul (publicUrl).
Are nevoie de pachetul segno: pip install segno"""
import json
from pathlib import Path
import segno

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "sursa/date-site.json").read_text(encoding="utf-8"))
url = data["publicUrl"].rstrip("/") + "/meniu.html"
qr = segno.make(url, error="m")
qr.save(str(ROOT / "assets/img/qr-meniu.svg"), scale=1, border=0, dark="#1f1612", light=None, xmldecl=False, svgns=True, nl=False)
print(url, qr.designator)
# Să se poată mări la orice dimensiune.
svg_path = ROOT / "assets/img/qr-meniu.svg"
svg = svg_path.read_text(encoding="utf-8")
size = qr.symbol_size(scale=1, border=0)[0]
svg = svg.replace(f'width="{size}" height="{size}"', f'viewBox="0 0 {size} {size}" shape-rendering="crispEdges"', 1)
svg_path.write_text(svg, encoding="utf-8")
