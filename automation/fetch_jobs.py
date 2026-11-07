#!/usr/bin/env python3
"""Fetch fresh job ads from the public Arbeitnow API and pre-filter them.

Writes Jobs/<date>/raw_candidates.json, which the daily Claude agent scores,
supplemented by its own web search.
Usage: python3 fetch_jobs.py <output_dir>
"""
import html
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREFS = json.loads((ROOT / "profile" / "preferences.json").read_text())
SEEN_FILE = ROOT / "Jobs" / "seen_jobs.json"
API = "https://www.arbeitnow.com/api/job-board-api?page={}"
NON_DE = ["london", "paris", "zürich", "zurich", "amsterdam", "utrecht", "rotterdam", "united kingdom",
          "england", "france", "switzerland", "nederland", "netherlands", "schweiz", "wien", "vienna",
          "leeds", "toulouse", "massy", "veenendaal", "alkmaar", "chur", "bern", "satigny", "schlieren",
          "rheinfelden", "erlenbach", "bremgarten", "barendrecht", "beugen", "uk", "manchester", "dundee", "edinburgh",
          "glasgow", "dublin", "ireland", "basel", "thun", "st. gallen", "geneva", "genf", "lausanne", "delft", "eindhoven",
          "brussels", "belgium", "spain", "madrid", "barcelona", "lisbon", "portugal", "warsaw", "poland", "prague",
          "italy", "milan", "stockholm", "copenhagen", "oslo", "helsinki", "usa", "united states", "canada", "india"]


def fetch(max_pages=10):
    jobs = []
    for page in range(1, max_pages + 1):
        try:
            req = urllib.request.Request(API.format(page), headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r).get("data", [])
        except Exception as e:  # network hiccup: keep what we have
            print(f"page {page} failed: {e}", file=sys.stderr)
            break
        if not data:
            break
        jobs.extend(data)
        time.sleep(1)
    return jobs


def clean(text, limit=2500):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    return text[:limit]


ROLE_WORDS = ["engineer", "developer", "entwickler", "scientist", "analyst", "programmer", "programmierer"]
YEARS = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|–|to|bis)?\s*\d{0,2}\s*\+?\s*(?:years|jahre|yrs)", re.I)


def min_years(text):
    """Smallest 'N years' experience requirement in the ad (None if it states none)."""
    nums = [int(m.group(1)) for m in YEARS.finditer(text or "") if 0 < int(m.group(1)) < 15]
    return min(nums) if nums else None


def relevant(job):
    title = job["title"].lower()
    loc = (job.get("location") or "").lower()
    if any(k in title for k in PREFS["exclude_keywords"]):
        return False
    if not any(k in title for k in PREFS["title_keywords"]):
        # No level word in the title (e.g. "AI Engineer"): keep it only if it is an engineering-type role
        # whose ad asks for at most 2 years of experience, so entry-level full-time jobs are not missed.
        if not any(w in title for w in ROLE_WORDS):
            return False
        years = min_years(clean(job.get("description"), 20000))
        if years is None or years > 2:
            return False
    if not any(re.search(rf"\b{re.escape(k)}", title) for k in PREFS["field_keywords"]):
        return False
    if any(re.search(rf"\b{re.escape(k)}\b", loc) for k in NON_DE):
        return False
    return True


# ---------- Company ATS feeds (profile/companies.json) ----------
# These read the company's own job system, so every URL is the live original posting.
DE_PLACES = ["germany", "deutschland", "lübeck", "luebeck", "hamburg", "kiel", "bremen", "hannover", "berlin",
             "münchen", "munich", "muenchen", "köln", "cologne", "frankfurt", "stuttgart", "düsseldorf",
             "dusseldorf", "leipzig", "dresden", "nürnberg", "nuremberg", "karlsruhe", "aachen", "potsdam",
             "bonn", "münster", "mannheim", "heidelberg", "freiburg", "jena", "parsdorf", "gilching", "dach"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def read_greenhouse(slug):
    data = json.loads(get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"))
    for j in data.get("jobs", []):
        yield dict(title=j["title"], company=j.get("company_name") or slug, location=(j.get("location") or {}).get("name", ""),
                   url=j["absolute_url"], posted=j.get("first_published") or j.get("updated_at"), description=html.unescape(j.get("content", "")))


def read_lever(slug):
    for j in json.loads(get(f"https://api.lever.co/v0/postings/{slug}?mode=json")):
        cat = j.get("categories") or {}
        yield dict(title=j["text"], company=slug, location=" / ".join(cat.get("allLocations") or [cat.get("location", "")]),
                   url=j["hostedUrl"], posted=j.get("createdAt"), description=j.get("descriptionPlain", "") + " " + j.get("additionalPlain", ""))


def read_ashby(slug):
    data = json.loads(get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}"))
    for j in data.get("jobs", []):
        locs = [j.get("location", "")] + [s.get("location", "") for s in j.get("secondaryLocations") or []]
        addr = ((j.get("address") or {}).get("postalAddress") or {}).get("addressCountry", "")
        yield dict(title=j["title"], company=slug, location=" / ".join(filter(None, locs + [addr])) + (" (remote)" if j.get("isRemote") else ""),
                   url=j["jobUrl"], posted=j.get("publishedAt"), description=j.get("descriptionPlain") or j.get("descriptionHtml", ""))


def read_personio(slug):
    root = ET.fromstring(get(f"https://{slug}.jobs.personio.de/xml?language=en"))
    for p in root.iter("position"):
        desc = " ".join((d.findtext("value") or "") for d in p.iter("jobDescription"))
        offices = [p.findtext("office") or ""] + [o.text or "" for o in p.iter("additionalOffice")]
        yield dict(title=p.findtext("name") or "", company=p.findtext("subcompany") or slug, location=" / ".join(filter(None, offices)),
                   url=f"https://{slug}.jobs.personio.de/job/{p.findtext('id')}", posted=p.findtext("createdAt"), description=desc)


def read_recruitee(slug):
    for j in json.loads(get(f"https://{slug}.recruitee.com/api/offers/")).get("offers", []):
        yield dict(title=j["title"], company=j.get("company_name") or slug, location=j.get("location", "") + (" (remote)" if j.get("remote") else ""),
                   url=j["careers_url"], posted=j.get("published_at"), description=j.get("description", "") + " " + j.get("requirements", ""))


READERS = {"greenhouse": read_greenhouse, "lever": read_lever, "ashby": read_ashby, "personio": read_personio, "recruitee": read_recruitee}


def fetch_company(c):
    try:
        return c, list(READERS[c["ats"]](c["slug"])), None
    except Exception as e:  # one broken board never stops the run
        return c, [], e


def in_germany(loc):
    loc = loc.lower()
    return any(p in loc for p in DE_PLACES) or loc.strip() in ("remote", "remote (remote)", "")


def fetch_companies(seen):
    path = ROOT / "profile" / "companies.json"
    if not path.exists():
        return []
    companies = json.loads(path.read_text()).get("companies", [])
    found, total, failed = [], 0, []
    with ThreadPoolExecutor(8) as ex:
        for c, jobs, err in ex.map(fetch_company, companies):
            if err:
                failed.append(c["slug"])
            total += len(jobs)
            for j in jobs:
                if not relevant(j) or not in_germany(j["location"]):
                    continue
                found.append({"source": f"{c['ats']}:{c['slug']}", "id": j["url"], "title": j["title"], "company": j["company"],
                              "location": j["location"], "remote": "remote" in j["location"].lower(), "job_types": [],
                              "url": j["url"], "posted": str(j["posted"] or ""), "seen_before": j["url"] in seen,
                              "verified_original": True, "description": clean(j["description"])})
    print(f"company feeds: {len(companies) - len(failed)}/{len(companies)} boards read, {total} jobs scanned, {len(found)} relevant"
          + (f" (failed: {', '.join(failed)})" if failed else ""))
    return found


def main():
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    seen = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
    candidates = fetch_companies(seen)
    for j in fetch():
        if not relevant(j):
            continue
        candidates.append({
            "source": "arbeitnow",
            "id": j["url"],
            "title": j["title"],
            "company": j["company_name"],
            "location": j.get("location"),
            "remote": j.get("remote"),
            "job_types": j.get("job_types"),
            "url": j["url"],
            "posted": j.get("created_at"),
            "seen_before": j["url"] in seen,
            "description": clean(j.get("description")),
        })
    unique = {}
    for c in candidates:  # the same ad can appear twice (two feeds, or twice in one feed)
        unique.setdefault(c["url"], c)
    candidates = list(unique.values())
    target = out_dir / "raw_candidates.json"
    if target.exists():  # never overwrite an earlier run of the same day
        target = out_dir / f"raw_candidates_{time.strftime('%H%M')}.json"
    target.write_text(json.dumps(candidates, ensure_ascii=False, indent=1))
    print(f"{len(candidates)} candidates -> {target}")


if __name__ == "__main__":
    main()
