#!/usr/bin/env python3
"""Check or propagate the shared agent-management principles.

ETerapy owns the canonical copy. Project checkouts keep local copies so they
remain usable in isolation. The default mode is read-only; --write performs the
explicit propagation requested by the owner.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


CANONICAL = Path(__file__).resolve().parents[2] / "docs/agents/shared-principles.md"
PROJECTS_ROOT = Path(__file__).resolve().parents[3]
ACTIVE_PROJECTS = ("eterapy", "openqareer", "freeroute", "arktove", "alisababaeva")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="replace drifting local copies")
    args = parser.parse_args()

    source = CANONICAL.read_bytes()
    drift: list[Path] = []
    for project in ACTIVE_PROJECTS:
        target = PROJECTS_ROOT / project / "docs/agents/shared-principles.md"
        if target.exists() and target.read_bytes() == source:
            print(f"ok      {target}")
            continue
        drift.append(target)
        if args.write:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source)
            print(f"updated {target}")
        else:
            current = digest(target.read_bytes()) if target.exists() else "missing"
            print(f"drift   {target} ({current} != {digest(source)})")

    if drift and not args.write:
        print("Run with --write after approving a shared-principles change.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
