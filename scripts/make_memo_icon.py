from PIL import Image, ImageDraw
from pathlib import Path

size = 1024
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# soft drop shadow
pad = 90
for i, alpha in enumerate([28, 40, 52]):
    shift = 18 - i * 3
    d.rounded_rectangle(
        [pad + shift, pad + shift + 10, size - pad + shift, size - pad + shift + 10],
        radius=48,
        fill=(40, 35, 25, alpha),
    )

# sticky body - warm yellow
d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=48, fill=(255, 232, 140, 255))

# subtle top highlight
d.rounded_rectangle(
    [pad + 8, pad + 8, size - pad - 8, pad + 120],
    radius=36,
    fill=(255, 244, 190, 210),
)

# folded dog-ear (bottom-right)
fold = 210
d.polygon(
    [
        (size - pad - fold, size - pad),
        (size - pad, size - pad),
        (size - pad, size - pad - fold),
    ],
    fill=(232, 196, 90, 255),
)
d.polygon(
    [
        (size - pad - fold, size - pad),
        (size - pad - 12, size - pad - fold + 12),
        (size - pad, size - pad - fold),
    ],
    fill=(255, 245, 200, 255),
)

# ruled lines (memo cue)
line_color = (90, 72, 35, 145)
x0, x1 = pad + 120, size - pad - 140
for y, shorten in ((390, 0), (500, 0), (610, 0), (720, 90)):
    d.rounded_rectangle([x0, y, x1 - shorten, y + 18], radius=9, fill=line_color)

# pin / pushpin at top
cx = size // 2
d.ellipse([cx - 28, pad + 36, cx + 28, pad + 92], fill=(214, 72, 72, 255))
d.ellipse([cx - 14, pad + 48, cx + 10, pad + 72], fill=(255, 170, 170, 210))

out = Path(r"C:\curcor\memo\src-tauri\icons\app-icon-source.png")
img.save(out, "PNG")
print(f"wrote {out} {img.size}")
