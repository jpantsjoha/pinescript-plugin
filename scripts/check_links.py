#!/usr/bin/env python3
"""Verify all reference URLs in skills and SOURCES.md resolve (HTTP 200).

Exit 0: all URLs resolve.
Exit 1: one or more failures.
"""
import sys
import re
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).parent.parent
TIMEOUT = 15
WORKERS = 10
URL_RE = re.compile(r"https?://[^\s\)\]\'\"><,]+")
HEADERS = {"User-Agent": "pinescript-plugin/0.1 link-checker"}


def check_url(url: str) -> tuple[str, int, str]:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return url, r.status, "OK"
    except urllib.error.HTTPError as e:
        return url, e.code, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return url, 0, str(e.reason)
    except Exception as e:
        return url, 0, type(e).__name__


def collect_urls() -> dict[str, set[str]]:
    url_map: dict[str, set[str]] = {}

    for path in sorted(ROOT.glob("skills/*/SKILL.md")):
        found = set(URL_RE.findall(path.read_text()))
        if found:
            url_map[str(path)] = found

    for path in sorted(ROOT.glob("skills/*/references/*.md")):
        found = set(URL_RE.findall(path.read_text()))
        if found:
            url_map[str(path)] = found

    sources = ROOT / "research" / "SOURCES.md"
    if sources.exists():
        found = set(URL_RE.findall(sources.read_text()))
        if found:
            url_map[str(sources)] = found

    return url_map


def main():
    url_map = collect_urls()
    all_urls = sorted({u for urls in url_map.values() for u in urls})

    if not all_urls:
        print("No URLs found to check")
        sys.exit(0)

    print(f"Checking {len(all_urls)} URL(s) with {WORKERS} workers...\n")
    failures: list[tuple[str, int, str]] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(check_url, url): url for url in all_urls}
        for future in as_completed(futures):
            url, status, msg = future.result()
            if status == 200:
                print(f"OK    {url}")
            else:
                print(f"FAIL  [{status}] {url}  — {msg}")
                failures.append((url, status, msg))

    print()
    if failures:
        print(f"{len(failures)} URL(s) failed", file=sys.stderr)
        sys.exit(1)

    print(f"{len(all_urls)} URL(s) resolved OK")


if __name__ == "__main__":
    main()
