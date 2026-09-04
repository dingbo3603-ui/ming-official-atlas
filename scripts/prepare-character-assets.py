from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw
from rembg import new_session, remove


CHARACTERS = {
    "emperor.png": "emperor.webp",
    "grand_secretary.png": "grand-secretary.webp",
    "civil_official.png": "civil-official.webp",
    "military_official.png": "military-official.webp",
    "prefect.png": "prefect.webp",
    "magistrate.png": "magistrate.webp",
    "eunuch.png": "eunuch.webp",
    "native_chieftain.png": "native-chieftain.webp",
}


def isolate_character(path: Path, session: object) -> Image.Image:
    return remove(
        Image.open(path).convert("RGB"),
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=12,
        alpha_matting_erode_size=8,
    ).convert("RGBA")


def preview(images: list[tuple[str, Image.Image]], path: Path) -> None:
    tile = 360
    canvas = Image.new("RGB", (tile * 4, tile * 2), (32, 26, 21))
    for index, (name, image) in enumerate(images):
        figure = image.copy()
        figure.thumbnail((tile, tile), Image.Resampling.LANCZOS)
        light = index % 2 == 0
        background = Image.new("RGB", (tile, tile), (230, 217, 187) if light else (75, 29, 24))
        x = (tile - figure.width) // 2
        y = (tile - figure.height) // 2
        background.paste(figure, (x, y), figure)
        ImageDraw.Draw(background).text((10, 10), name, fill=(24, 22, 18) if light else (242, 218, 170))
        canvas.paste(background, ((index % 4) * tile, (index // 4) * tile))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, quality=92)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: prepare-character-assets.py SOURCE_DIR PUBLIC_DIR QA_PREVIEW")
    source_dir, public_dir, qa_path = map(Path, sys.argv[1:])
    original_dir = source_dir / "original-dark-bg"
    public_dir.mkdir(parents=True, exist_ok=True)
    session = new_session("u2net_human_seg")
    prepared: list[tuple[str, Image.Image]] = []
    for source_name, output_name in CHARACTERS.items():
        source_path = original_dir / source_name
        if not source_path.exists():
            source_path = source_dir / source_name
        image = isolate_character(source_path, session)
        image.save(public_dir / output_name, "WEBP", quality=91, method=6, lossless=False)
        prepared.append((Path(output_name).stem, image))
        alpha = image.getchannel("A")
        if alpha.getextrema() != (0, 255):
            raise ValueError(f"invalid alpha range for {source_name}")
    preview(prepared, qa_path)

    for source_name, output_name in CHARACTERS.items():
        path = public_dir / output_name
        with Image.open(path) as image:
            if "A" not in image.getbands():
                raise ValueError(f"alpha missing from {output_name}")
            print(output_name, image.size, image.mode, image.getchannel("A").getextrema(), path.stat().st_size)


if __name__ == "__main__":
    main()
