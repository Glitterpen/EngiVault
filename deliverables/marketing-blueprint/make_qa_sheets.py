from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent / "rendered"
pages = sorted(root.glob("page-*.png"))
for sheet_index, start in enumerate(range(0, len(pages), 4), start=1):
    group = pages[start:start + 4]
    opened = [Image.open(path).convert("RGB") for path in group]
    width = max(image.width for image in opened)
    height = max(image.height for image in opened)
    sheet = Image.new("RGB", (width * 2 + 60, height * 2 + 100), "#DDE5EC")
    draw = ImageDraw.Draw(sheet)
    for index, (path, image) in enumerate(zip(group, opened)):
        x = 20 + (index % 2) * (width + 20)
        y = 38 + (index // 2) * (height + 40)
        draw.text((x, y - 24), path.stem, fill="#082345")
        sheet.paste(image, (x, y))
    sheet.save(root / f"qa-sheet-{sheet_index:02d}.png", optimize=True)
