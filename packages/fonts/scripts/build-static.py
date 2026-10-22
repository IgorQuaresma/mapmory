"""
Builds static TrueType instances (one file per weight) from the variable fonts in ../variable.

Why: Chromium embeds variable fonts in PDFs as Type 3 fonts, which some prepress checks reject and which
poppler drops when rasterizing at print resolution (docs/adr/0002). Static instances are embedded as
TrueType (CIDFontType2) subsets. Martin also exposes clean label fontstacks such as "Inter Regular".

Usage: python3 scripts/build-static.py   (requires fonttools: pip install fonttools)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "variable"
OUT = ROOT / "ttf"

# id -> (source file, family name, weights). Must match src/index.ts FONT_CATALOG.
FONTS = {
    "playfair-display": ("playfair-display.ttf", "Playfair Display", range(400, 901, 100)),
    "montserrat": ("montserrat.ttf", "Montserrat", range(100, 901, 100)),
    "cormorant-garamond": ("cormorant-garamond.ttf", "Cormorant Garamond", range(300, 701, 100)),
    "inter": ("inter.ttf", "Inter", range(100, 901, 100)),
    "josefin-sans": ("josefin-sans.ttf", "Josefin Sans", range(100, 701, 100)),
    "noto-sans": ("noto-sans.ttf", "Noto Sans", [400]),
}
STATIC_ONLY = {"great-vibes": ("great-vibes.ttf", "Great Vibes", [400])}
STYLE = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}


def set_names(font: TTFont, family: str, style: str) -> None:
    name = font["name"]
    full = f"{family} {style}" if style != "Regular" else f"{family} Regular"
    ps = f"{family.replace(' ', '')}-{style}"
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    for nid, value in ((1, family), (2, style), (3, f"Mapmory:{ps}"), (4, full), (6, ps), (16, family), (17, style)):
        name.setName(value, nid, 3, 1, 0x409)
        name.setName(value, nid, 1, 0, 0)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.ttf"):
        old.unlink()
    for fid, (src, family, weights) in FONTS.items():
        for w in weights:
            font = TTFont(SRC / src)
            axes = {a.axisTag: a for a in font["fvar"].axes}
            location = {tag: a.defaultValue for tag, a in axes.items()}
            location["wght"] = max(axes["wght"].minValue, min(axes["wght"].maxValue, w))
            static = instancer.instantiateVariableFont(font, location)
            set_names(static, family, STYLE[w])
            static["OS/2"].usWeightClass = w
            static.save(OUT / f"{fid}-{w}.ttf")
            print("wrote", f"{fid}-{w}.ttf")
    for fid, (src, family, weights) in STATIC_ONLY.items():
        font = TTFont(SRC / src)
        set_names(font, family, "Regular")
        font.save(OUT / f"{fid}-400.ttf")
        print("wrote", f"{fid}-400.ttf")


if __name__ == "__main__":
    main()
