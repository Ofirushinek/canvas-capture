#!/usr/bin/env python3
"""Pixel-diff two full-page screenshots (the capture's render vs. the live
page) and report a real number instead of an eyeballed guess.

Used by .claude/commands/capture.md step 3: the fix-then-reverify loop reads
this script's JSON to decide whether a capture is close enough to publish,
and which vertical band to actually look at when it isn't — instead of
scanning two full-page screenshots by hand every round.

Usage:
    python3 diff-screenshots.py <capture.png> <live.png> [bandHeight=100] [heatmapOutPath]

Output (stdout, one JSON object):
    {
      "width": <common width used>,
      "height": <common height used>,
      "diffPercent": <0-100, share of pixels that differ beyond the
                       anti-aliasing/font-hinting noise floor>,
      "worstBands": [{"yStart":, "yEnd":, "diffPercent":}, ...]  (top 5,
                       sorted by diffPercent descending, empty bands with
                       ~0 diff omitted so a long matching page doesn't
                       drown the real ones)
    }

If a heatmap path is given, writes a grayscale image the same size as the
common crop where brightness = how much that pixel differs — a single image
to glance at instead of flipping between two screenshots.
"""
import sys
import json
from PIL import Image, ImageChops

# Anti-aliasing and font-hinting differences between two independent
# renders (this tool's flattened output vs. the live page's real CSS
# cascade) are real but visually meaningless — without a noise floor, a
# perfectly correct capture still reports a nonzero diff on nearly every
# text pixel, making the number useless for deciding "good enough to
# publish." 24 (of 255 per channel) was picked empirically: real structural
# diffs (a missing element, a wrong color, a shifted layout) clear it by a
# wide margin; sub-pixel font rendering does not.
THRESHOLD = 24


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: diff-screenshots.py <a.png> <b.png> [bandHeight] [heatmapOut]"}))
        sys.exit(1)
    path_a, path_b = sys.argv[1], sys.argv[2]
    band_height = int(sys.argv[3]) if len(sys.argv) > 3 else 100
    heatmap_out = sys.argv[4] if len(sys.argv) > 4 else None

    a = Image.open(path_a).convert('RGB')
    b = Image.open(path_b).convert('RGB')
    # Two independent full-page renders rarely land on the exact same
    # height (a lazy-loaded banner, a slightly different font metric) —
    # compare only the common top region rather than failing outright, and
    # let a real height mismatch show up as its own signal (see the caller
    # in capture.md, which already checks captured height against the
    # live page's scrollHeight separately).
    w = min(a.width, b.width)
    h = min(a.height, b.height)
    a = a.crop((0, 0, w, h))
    b = b.crop((0, 0, w, h))

    diff = ImageChops.difference(a, b)
    r, g, bch = diff.split()
    # Per-pixel max across channels, as a single 'L' band — pure PIL, no
    # numpy dependency: a color that shifted in only one channel (e.g. a
    # slightly-off blue) still counts as a real difference at that pixel.
    diff_max = ImageChops.lighter(ImageChops.lighter(r, g), bch)
    mask = diff_max.point(lambda p: 255 if p > THRESHOLD else 0)

    def diff_percent(img):
        hist = img.histogram()
        total = img.width * img.height
        if total == 0:
            return 0.0
        nonzero = total - hist[0]
        return round(100 * nonzero / total, 3)

    overall = diff_percent(mask)

    bands = []
    y = 0
    while y < h:
        y_end = min(y + band_height, h)
        band = mask.crop((0, y, w, y_end))
        bands.append({"yStart": y, "yEnd": y_end, "diffPercent": diff_percent(band)})
        y = y_end
    worst_bands = sorted(
        [band for band in bands if band["diffPercent"] > 0.5],
        key=lambda band: band["diffPercent"],
        reverse=True,
    )[:5]

    if heatmap_out:
        diff_max.save(heatmap_out)

    print(json.dumps({
        "width": w,
        "height": h,
        "diffPercent": overall,
        "worstBands": worst_bands,
    }))


if __name__ == '__main__':
    main()
