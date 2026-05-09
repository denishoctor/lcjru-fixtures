"""Generate PWA icons for LCJRU Fixtures.

Produces four PNG files in docs/assets/:
  icon-192.png            — manifest icon, purpose: any (192x192)
  icon-512.png            — manifest icon, purpose: any (512x512)
  icon-512-maskable.png   — manifest icon, purpose: maskable (512x512, safe-zone respected)
  apple-touch-icon-180.png — iOS home-screen icon (180x180)

Design: navy full-bleed background with the wordmark "LCJ" centred in heavy
white, and a thin gold underline accent. All four use the same composition
so the brand reads consistently whether the launcher crops aggressively
(Android maskable) or not (iOS rounded-square mask).
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

NAVY = (2, 20, 68)        # #021444
GOLD = (244, 200, 66)     # #F4C842
WHITE = (255, 255, 255)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

ASSETS = Path(__file__).parent.parent / "docs" / "assets"


def render_icon(size: int, *, safe_zone: float = 0.78) -> Image.Image:
    """Render one square icon at `size` px.

    safe_zone — fraction of the canvas the wordmark + accent must stay within.
    0.78 keeps content inside Android's 80%-circle maskable safe zone.
    """
    img = Image.new("RGBA", (size, size), NAVY + (255,))
    draw = ImageDraw.Draw(img)

    # Wordmark: "LCJ" centred. Pick the largest font size that fits inside the
    # safe zone horizontally (with a 5% side margin) and ~50% of safe-zone height.
    text = "LCJ"
    safe_px = int(size * safe_zone)
    max_text_width = int(safe_px * 0.92)
    max_text_height = int(safe_px * 0.55)

    # Binary-ish search for a font size that fits.
    font_size = size
    while font_size > 8:
        font = ImageFont.truetype(FONT_BOLD, font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        if w <= max_text_width and h <= max_text_height:
            break
        font_size -= 4
    font = ImageFont.truetype(FONT_BOLD, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    # Centre, biased slightly upward so the gold accent has room.
    cx = size // 2
    cy = size // 2 - int(size * 0.04)
    x = cx - w // 2 - bbox[0]
    y = cy - h // 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=WHITE)

    # Gold accent: a horizontal rule centred under the wordmark.
    rule_y = cy + h // 2 + int(size * 0.06)
    rule_w = int(size * 0.34)
    rule_h = max(2, int(size * 0.022))
    draw.rectangle(
        [cx - rule_w // 2, rule_y, cx + rule_w // 2, rule_y + rule_h],
        fill=GOLD,
    )

    return img


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-512.png", 512),
        ("icon-192.png", 192),
        ("icon-512-maskable.png", 512),
        ("apple-touch-icon-180.png", 180),
    ]
    for name, size in targets:
        img = render_icon(size)
        # Apple touch icons must be opaque RGB (no alpha) so iOS doesn't darken them.
        if name.startswith("apple-touch"):
            img = img.convert("RGB")
        out = ASSETS / name
        img.save(out, "PNG", optimize=True)
        print(f"wrote {out.relative_to(ASSETS.parent.parent)}  ({size}x{size})")


if __name__ == "__main__":
    main()
