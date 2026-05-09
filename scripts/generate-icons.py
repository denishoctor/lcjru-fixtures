"""Generate PWA icons for LCJRU Fixtures from the club crest.

Produces four PNGs in docs/assets/:
  icon-192.png             — manifest icon, purpose: any (192x192)
  icon-512.png             — manifest icon, purpose: any (512x512)
  icon-512-maskable.png    — manifest icon, purpose: maskable (512x512)
  apple-touch-icon-180.png — iOS home-screen icon (180x180, opaque RGB)

Source: docs/assets/lcjru-logo.png (the club crest + wordmark on navy).
We crop the rugby-ball crest out of the source, drop the wordmark (illegible
at home-screen size), and centre-paste onto a navy canvas. Maskable uses a
tighter scale so the crest stays inside Android's 80% safe-zone circle.
"""
from PIL import Image
from pathlib import Path

NAVY = (2, 20, 68)  # #021444

ROOT = Path(__file__).parent.parent
ASSETS = ROOT / "docs" / "assets"
SOURCE = ASSETS / "lcjru-logo.png"


def detect_crest_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """Find the bounding box of the rugby-ball crest in the source image.

    The source is navy with the crest in the upper portion and the wordmark
    underneath. We mask to non-navy pixels, then take the bbox of just the
    upper 65% (which excludes 'EST 1951 / LANE COVE / JUNIOR RUGBY').
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    # Crop to the upper region so the wordmark is excluded.
    upper = rgb.crop((0, 0, w, int(h * 0.65)))
    px = upper.load()
    uw, uh = upper.size
    # Build a mask of pixels distinct from navy (channel-wise tolerance of 30).
    mask = Image.new("L", (uw, uh), 0)
    mpx = mask.load()
    for y in range(uh):
        for x in range(uw):
            r, g, b = px[x, y]
            if abs(r - NAVY[0]) > 30 or abs(g - NAVY[1]) > 30 or abs(b - NAVY[2]) > 30:
                mpx[x, y] = 255
    bbox = mask.getbbox()
    if bbox is None:
        raise RuntimeError("crest not detected in source image")
    return bbox  # (left, top, right, bottom) within the upper crop


def render_icon(crest: Image.Image, size: int, *, scale: float) -> Image.Image:
    """Centre-paste `crest` onto a navy canvas of `size`px, fitted to `scale`."""
    canvas = Image.new("RGBA", (size, size), NAVY + (255,))
    cw, ch = crest.size
    target = int(size * scale)
    # Preserve aspect ratio: fit the crest's longer side to `target`.
    if cw >= ch:
        new_w = target
        new_h = max(1, round(ch * target / cw))
    else:
        new_h = target
        new_w = max(1, round(cw * target / ch))
    resized = crest.resize((new_w, new_h), Image.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(resized, (x, y), resized if resized.mode == "RGBA" else None)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source logo: {SOURCE}")

    src = Image.open(SOURCE)
    bbox = detect_crest_bbox(src)
    # bbox is in the upper-65% crop's coords, which shares its origin with the
    # full image, so it crops correctly out of `src` directly.
    crest = src.crop(bbox).convert("RGBA")

    targets = [
        # name, size, scale (fraction of canvas the crest's longer side occupies)
        ("icon-512.png",            512, 0.84),
        ("icon-192.png",            192, 0.84),
        ("icon-512-maskable.png",   512, 0.66),  # 80% safe-zone — tighter
        ("apple-touch-icon-180.png", 180, 0.84),
    ]
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name, size, scale in targets:
        img = render_icon(crest, size, scale=scale)
        # Apple touch icons must be opaque RGB so iOS doesn't darken them.
        if name.startswith("apple-touch"):
            img = img.convert("RGB")
        out = ASSETS / name
        img.save(out, "PNG", optimize=True)
        print(f"wrote {out.relative_to(ROOT)}  ({size}x{size}, scale={scale})")


if __name__ == "__main__":
    main()
