#!/usr/bin/env python3
"""Fetch the public-domain Rider-Waite-Smith (Pamela Colman Smith, 1909) tarot
scans from Wikimedia Commons into web/public/tarot/ with a stable naming scheme.

Only the ORIGINAL 1909 PCS scans are public domain everywhere; we deliberately
avoid modern recolored/"enhanced" editions. Sources are the canonical Commons
files: RWS_Tarot_NN_Name.jpg (majors) and {Wands,Cups,Swords,Pents}NN.jpg (minors).

Output names map 1:1 to our deck codes (see web/src/lib/symbolic-products.ts):
  majors -> major-00.jpg .. major-21.jpg
  minors -> wands-01.jpg .. pents-14.jpg   (01=Ace .. 11=Page,12=Knight,13=Queen,14=King)

Usage: python3 scripts/fetch-tarot-rws.py
Idempotent: re-running re-downloads. Requires macOS `sips` for resizing.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

OUT = os.path.join("web", "public", "tarot")
API = "https://commons.wikimedia.org/w/api.php"
UA = "ETerapyTarotAssetFetch/1.0 (https://eterapy.com; public-domain RWS scans)"
TARGET_WIDTH = 640  # crisp at 2x for the card display sizes we use

MAJORS = [
    "RWS_Tarot_00_Fool.jpg", "RWS_Tarot_01_Magician.jpg", "RWS_Tarot_02_High_Priestess.jpg",
    "RWS_Tarot_03_Empress.jpg", "RWS_Tarot_04_Emperor.jpg", "RWS_Tarot_05_Hierophant.jpg",
    "RWS_Tarot_06_Lovers.jpg", "RWS_Tarot_07_Chariot.jpg", "RWS_Tarot_08_Strength.jpg",
    "RWS_Tarot_09_Hermit.jpg", "RWS_Tarot_10_Wheel_of_Fortune.jpg", "RWS_Tarot_11_Justice.jpg",
    "RWS_Tarot_12_Hanged_Man.jpg", "RWS_Tarot_13_Death.jpg", "RWS_Tarot_14_Temperance.jpg",
    "RWS_Tarot_15_Devil.jpg", "RWS_Tarot_16_Tower.jpg", "RWS_Tarot_17_Star.jpg",
    "RWS_Tarot_18_Moon.jpg", "RWS_Tarot_19_Sun.jpg", "RWS_Tarot_20_Judgement.jpg",
    "RWS_Tarot_21_World.jpg",
]

# (commons-prefix, local-suit)
SUITS = [("Wands", "wands"), ("Cups", "cups"), ("Swords", "swords"), ("Pents", "pents")]

# Build: { local_output_name : commons_File_title }
plan = {}
for i, fname in enumerate(MAJORS):
    plan[f"major-{i:02d}.jpg"] = f"File:{fname}"
for prefix, suit in SUITS:
    for n in range(1, 15):
        plan[f"{suit}-{n:02d}.jpg"] = f"File:{prefix}{n:02d}.jpg"


def api_get(params):
    params = {**params, "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def resolve_urls(titles):
    """Return {File:title -> download url} via imageinfo, batched."""
    out = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        data = api_get({
            "action": "query", "titles": "|".join(batch),
            "prop": "imageinfo", "iiprop": "url",
        })
        pages = data.get("query", {}).get("pages", {})
        norm = {n["from"]: n["to"] for n in data.get("query", {}).get("normalized", [])}
        for page in pages.values():
            title = page.get("title")
            if "imageinfo" in page:
                out[title] = page["imageinfo"][0]["url"]
            else:
                out[title] = None  # missing
        # map normalized titles back
        for frm, to in norm.items():
            if to in out:
                out[frm] = out[to]
        time.sleep(0.2)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    urls = resolve_urls(list(plan.values()))
    missing = [t for t in plan.values() if not urls.get(t)]
    if missing:
        print("MISSING on Commons:", missing)
    ok = 0
    for local, title in plan.items():
        url = urls.get(title)
        if not url:
            print(f"skip (no url): {local} <- {title}")
            continue
        dest = os.path.join(OUT, local)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            # resize down to TARGET_WIDTH (keeps aspect, only shrinks)
            subprocess.run(
                ["sips", "--resampleWidth", str(TARGET_WIDTH), dest],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            ok += 1
            print(f"ok: {local}  ({len(data)//1024} KB src)")
            time.sleep(0.15)
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {local} <- {title}: {e}", file=sys.stderr)
    print(f"\nDownloaded {ok}/{len(plan)} cards into {OUT}")


if __name__ == "__main__":
    main()
