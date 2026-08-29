#!/usr/bin/env python3
"""Generate tiny synthetic fixtures for the Phase 5 module demo.

No sample 360 / oriented-image sets ship under .context/potree/pointclouds,
so this writes minimal-but-valid ones:

  images360/coordinates.txt + images360/pano_*.png   (equirectangular-ish)
  oriented-images/camera.xml + images.txt + photo_*.png

Pure stdlib (zlib + struct) PNG writer - no PIL / numpy needed.
"""

import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def write_png(path, width, height, rgb_fn):
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b = rgb_fn(x, y, width, height)
            raw += bytes((r & 255, g & 255, b & 255))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(path, HERE))


def pano_fn(hue):
    def fn(x, y, w, h):
        # vertical gradient + longitudinal colour bands so orientation is visible
        band = int(x / w * 12) % 2
        v = 40 + int(160 * (1 - y / h))
        if hue == 0:
            return (v, v // 3 + band * 40, v // 3)
        if hue == 1:
            return (v // 3, v, v // 3 + band * 40)
        return (v // 3 + band * 40, v // 3, v)
    return fn


def photo_fn(idx):
    def fn(x, y, w, h):
        cx, cy = w / 2, h / 2
        d = math.hypot(x - cx, y - cy) / math.hypot(cx, cy)
        base = int(220 * (1 - d))
        return (base if idx % 3 == 0 else base // 2,
                base if idx % 3 == 1 else base // 2,
                base if idx % 3 == 2 else base // 2)
    return fn


def main():
    # --- 360 panoramas -----------------------------------------------------
    d360 = os.path.join(HERE, "images360")
    for i in range(3):
        write_png(os.path.join(d360, f"pano_{i}.png"), 512, 256, pano_fn(i))

    coords = [
        'Filename\tTimestamp\tLongitude\tLatitude\tAltitude\tCourse\tPitch\tRoll',
        '"pano_0.png"\t0\t0\t0\t2\t0\t0\t0',
        '"pano_1.png"\t1\t6\t0\t2\t90\t0\t0',
        '"pano_2.png"\t2\t6\t6\t2\t180\t0\t0',
    ]
    with open(os.path.join(d360, "coordinates.txt"), "w") as f:
        f.write("\n".join(coords) + "\n")
    print("wrote images360/coordinates.txt")

    # --- oriented images -------------------------------------------------
    doi = os.path.join(HERE, "oriented-images")
    for i in range(3):
        write_png(os.path.join(doi, f"photo_{i}.png"), 320, 240, photo_fn(i))

    with open(os.path.join(doi, "camera.xml"), "w") as f:
        f.write(
            '<?xml version="1.0"?>\n<calibration>\n'
            '  <width>320</width>\n  <height>240</height>\n'
            '  <f>350</f>\n</calibration>\n'
        )
    print("wrote oriented-images/camera.xml")

    rows = [
        "# id x y z omega phi kappa",
        "photo_0.png 0 0 3 0 0 0",
        "photo_1.png 5 0 3 0 20 0",
        "photo_2.png 5 5 3 0 20 30",
    ]
    with open(os.path.join(doi, "images.txt"), "w") as f:
        f.write("\n".join(rows) + "\n")
    print("wrote oriented-images/images.txt")


if __name__ == "__main__":
    main()
