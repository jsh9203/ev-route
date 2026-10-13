"""Download a logo (PNG/ICO/SVG) and save it as a 100x100 transparent PNG.
SVG needs `pip install resvg-py`.

usage: python -I make_icon.py <busiId> <image_url_or_path> [out_dir] [--crop L,T,R,B] [--all]
  --crop  keep only this box first (values <= 1 are fractions of width/height, else pixels)
  --all   also clear enclosed background areas (e.g. inside letters), not only border-connected
"""
import io
import sys
from collections import Counter, deque
from pathlib import Path

import requests
from PIL import Image

SIZE = 100
PAD = 6
WHITE_TOL = 18  # how close to white counts as background


def remove_bg(img: Image.Image, everywhere: bool = False) -> Image.Image:
    """Make the background transparent.

    Background = transparent pixels plus, when the image has an opaque border, pixels close to
    the corner colour (white, light grey ...). Images with a transparent border keep their own
    white/light pixels, so white logos survive.
    """
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    border = [px[x, y] for x in range(w) for y in (0, h - 1)] + [px[x, y] for y in range(h) for x in (0, w - 1)]
    opaque = [p[:3] for p in border if p[3] >= 128]
    if len(opaque) < len(border) / 2:
        ref = None  # mostly transparent border: only alpha counts as background
    else:  # most common (coarsely quantised) opaque border colour, usually white
        common = Counter((r // 16, g // 16, b // 16) for r, g, b in opaque).most_common(1)[0][0]
        ref = tuple(c * 16 + 8 for c in common)

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a < 10:
            return True
        return ref is not None and max(abs(r - ref[0]), abs(g - ref[1]), abs(b - ref[2])) <= WHITE_TOL + 8

    if everywhere:
        for y in range(h):
            for x in range(w):
                if is_bg(x, y):
                    px[x, y] = (255, 255, 255, 0)
        return img

    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[x][y] or not is_bg(x, y):
            continue
        seen[x][y] = True
        px[x, y] = (255, 255, 255, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def crop_box(img: Image.Image, spec: str) -> Image.Image:
    l, t, r, b = (float(v) for v in spec.split(","))
    w, h = img.size
    if max(l, t, r, b) <= 1:
        l, r, t, b = l * w, r * w, t * h, b * h
    return img.crop((int(l), int(t), int(r), int(b)))


def load_source(src: str) -> bytes:
    """Return raster bytes from a URL or local path; SVG is rendered to a large PNG first."""
    if src.startswith(("http://", "https://")):
        try:
            res = requests.get(src, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        except requests.exceptions.SSLError:  # some KR sites ship incomplete cert chains
            res = requests.get(src, headers={"User-Agent": "Mozilla/5.0"}, timeout=20, verify=False)
        res.raise_for_status()
        data, ctype = res.content, res.headers.get("content-type", "")
    else:
        data, ctype = Path(src).read_bytes(), ""
    head = data[:512].lstrip().lower()
    if "svg" not in ctype and not head.startswith((b"<svg", b"<?xml")):
        return data
    import resvg_py  # pip install resvg-py

    return bytes(resvg_py.svg_to_bytes(svg_string=data.decode("utf-8"), width=512))


def main():
    args = sys.argv[1:]
    crop = args.pop(args.index("--crop") + 1) if "--crop" in args else None
    if crop:
        args.remove("--crop")
    everywhere = "--all" in args
    if everywhere:
        args.remove("--all")
    busi_id, src = args[0], args[1]
    out_dir = Path(args[2] if len(args) > 2 else "icon")
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(io.BytesIO(load_source(src)))
    img = img.convert("RGBA")
    if crop:
        img = crop_box(img, crop)
    img = remove_bg(img, everywhere)

    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    inner = SIZE - PAD * 2
    img.thumbnail((inner, inner), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2), img)
    out = out_dir / f"{busi_id}.png"
    canvas.save(out)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
