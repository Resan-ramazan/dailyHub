#!/usr/bin/env python3
"""Render one or more HTML files to PDF with headless Chrome/Chromium.

Works on macOS (Google Chrome) and in the Linux cloud sandbox (chromium, or Playwright's
Chromium, which is installed automatically if no browser is found).
Usage:
    python3 render_pdf.py file1.html [file2.html ...]
Each PDF is written next to its HTML file with the same base name.
"""
import glob
import shutil
import subprocess
import sys
from pathlib import Path

CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
]


def find_browser():
    for c in CANDIDATES:
        if Path(c).exists() or shutil.which(c):
            return shutil.which(c) or c
    pw = sorted(glob.glob(str(Path.home() / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    if pw:
        return pw[-1]
    # Cloud fallback: install Playwright's Chromium once.
    print("No Chrome found – installing Playwright Chromium…", file=sys.stderr)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright"], check=True)
    subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"], check=True)
    pw = sorted(glob.glob(str(Path.home() / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    if not pw:
        sys.exit("Could not find or install a Chromium browser.")
    return pw[-1]


def render(browser: str, html: Path) -> Path:
    pdf = html.with_suffix(".pdf").resolve()
    subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf}", html.resolve().as_uri()],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )
    return pdf


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    b = find_browser()
    for arg in sys.argv[1:]:
        print("PDF:", render(b, Path(arg)))
