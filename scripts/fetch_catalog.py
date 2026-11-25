"""Cache the individual Columbia Bulletin results, following referenced course records.

Run with Python, requests and beautifulsoup4. Pass an external cache directory,
then a JSON file of course IDs or program definitions. Cached HTML stays local.
"""
import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, unquote

import requests
from bs4 import BeautifulSoup

COURSE = re.compile(r"\b[A-Z]{3,5} (?:[A-Z]{1,3})\d{4}\b")


def download(code, directory):
    path = directory / (code + ".html")
    if not path.exists():
        url = "https://bulletin.columbia.edu/search/?P=" + quote(code)
        for attempt in range(3):
            try:
                response = requests.get(url, timeout=35)
                response.raise_for_status()
                if "Search Results" not in response.text:
                    raise ValueError("Unexpected Bulletin response")
                path.write_bytes(response.content)
                break
            except (ValueError, requests.RequestException) as error:
                if attempt == 2:
                    print(code, error, flush=True)
                    return set()
                time.sleep(1 + attempt)
        time.sleep(0.15)
    page = BeautifulSoup(path.read_bytes(), "html.parser")
    course = page.select_one("article.search-courseresult")
    if not course:
        return set()
    found = set()
    for span in course.select(".prereq,.coreq"):
        for link in span.select("a[href*='?P=']"):
            found.update(COURSE.findall(unquote(link["href"].split("?P=")[-1])))
    return found


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("seeds", type=Path, nargs="+")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    pending = set()
    for file in args.seeds:
        pending.update(COURSE.findall(json.dumps(json.loads(file.read_text(encoding="utf-8-sig")), ensure_ascii=False)))
    visited = set()
    with ThreadPoolExecutor(max_workers=5) as pool:
        while pending:
            batch = sorted(pending)
            visited.update(batch)
            print(f"Checking {len(batch)} listings ({len(visited)} total)", flush=True)
            pending = set().union(*pool.map(lambda code: download(code, args.cache), batch)) - visited
