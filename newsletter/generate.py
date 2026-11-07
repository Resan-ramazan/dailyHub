#!/usr/bin/env python3
"""Daily AI newsletter, written by ChatGPT.

Default: runs your prompt through the Codex CLI that ships with the ChatGPT
app, signed in with your ChatGPT account, so it uses your ChatGPT plan
(no API credits, no Claude tokens). Codex has live web search.
Optional: NEWSLETTER_BACKEND=api uses the paid OpenAI API instead
(needs OPENAI_API_KEY with credits; OPENAI_MODEL picks the model).

Reads newsletter/prompt.md, adds today's date, the reader profile, the
skill gaps from the latest Job Radar report and recently featured items
(to avoid repeats), and writes News/<date>/issue.json + issue.md.
Usage: python3 newsletter/generate.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEWS = ROOT / "News"
API = "https://api.openai.com/v1/responses"
DEFAULT_API_MODEL = "gpt-5-mini"
CODEX_APP_BIN = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"
CODEX_TIMEOUT = 20 * 60  # seconds

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "intro", "items", "sections", "for_you"],
    "properties": {
        "headline": {"type": "string", "description": "One-line headline for today's issue"},
        "intro": {"type": "string", "description": "One or two sentences framing today's issue"},
        "items": {
            "type": "array",
            "description": "The stories or projects, in the order the instructions ask for",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "tag", "url", "source", "summary", "why", "details"],
                "properties": {
                    "title": {"type": "string", "description": "Story or project name"},
                    "tag": {"type": "string", "description": "Short category"},
                    "url": {"type": "string", "description": "Direct link to the original source or GitHub repository"},
                    "source": {"type": "string", "description": "Site or owner, e.g. github.com/owner"},
                    "summary": {"type": "string", "description": "What it is / what happened, 2-3 sentences"},
                    "why": {"type": "string", "description": "Why it matters / why it is interesting, one or two sentences"},
                    "details": {
                        "type": "array",
                        "description": "Every other labelled field the instructions ask for per item, in order (e.g. who it is for, quick start, risks, freshness evidence)",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "text"],
                            "properties": {"label": {"type": "string"}, "text": {"type": "string", "description": "Markdown allowed"}},
                        },
                    },
                },
            },
        },
        "sections": {
            "type": "array",
            "description": "Closing sections the instructions ask for (e.g. a trend summary or a pick of the day), in order",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "body"],
                "properties": {"title": {"type": "string"}, "body": {"type": "string", "description": "Markdown"}},
            },
        },
        "for_you": {"type": "string", "description": "Markdown: how today's issue connects to the reader's skill gaps and job search. Empty string if already covered by a section."},
    },
}


def load_env(path=ROOT / ".env"):
    """Read KEY=value lines from .env into os.environ (tolerates spaces, quotes, comments, `export`)."""
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if not m or line.lstrip().startswith("#"):
            continue
        key, val = m.group(1), m.group(2)
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        os.environ.setdefault(key, val)


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def latest_skill_gaps():
    days = sorted((p for p in (ROOT / "Jobs").glob("20??-??-??") if p.is_dir()), reverse=True)
    for d in days:
        report = d / "00_Daily_Report.md"
        if not report.exists():
            continue
        m = re.search(r"^## Skill gaps[^\n]*\n(.*?)(?=^## |\Z)", report.read_text(), re.S | re.M)
        if m:
            return m.group(1).strip()
    return ""


def recent_titles(limit_days=5):
    titles = []
    for d in sorted(NEWS.glob("20??-??-??/issue.json"), reverse=True)[:limit_days]:
        try:
            titles += [it["title"] for it in json.loads(d.read_text()).get("items", [])]
        except Exception:
            pass
    return titles


def build_prompt():
    user_prompt = re.sub(r"<!--.*?-->", "", (ROOT / "newsletter" / "prompt.md").read_text(), flags=re.S).strip()
    gaps = latest_skill_gaps()
    seen = recent_titles()
    parts = [
        user_prompt,
        f"\nToday is {date.today():%A, %d %B %Y}. Use web search. Follow the time window in the instructions above (if none is given, use the last 48 hours).",
        "Every item needs a working direct link (for a project: its GitHub repository; never a search page). Never invent a link, date or number; drop the item instead.",
        "Write in the language the instructions ask for; keep technical terms in English where natural.",
        "\nAbout the reader: M.Sc. Artificial Intelligence student in Germany; web developer background (React, TypeScript, Node.js, Python, REST APIs); looking for a working-student role in software or AI.",
    ]
    if gaps:
        parts.append("\nThe reader's current skill gaps from their job search. Use them when explaining why something is valuable for them:\n" + gaps)
    if seen:
        parts.append("\nAlready featured in recent issues. Do not repeat unless there was an important new release:\n- " + "\n- ".join(seen[:60]))
    parts.append(
        "\nReturn the whole issue as JSON matching the given schema: one entry in `items` per story or project, "
        "put each extra per-item field from the format above into `details` with its label, "
        "and put closing sections (such as a trend summary or a pick of the day) into `sections`."
    )
    return "\n".join(parts)


def codex_bin():
    for c in (os.environ.get("CODEX_BIN"), CODEX_APP_BIN, shutil.which("codex")):
        if c and os.access(c, os.X_OK):
            return c
    return None


def call_codex(prompt, schema_obj=None, effort="medium"):
    """Runs Codex non-interactively with web search and a JSON schema (default: the issue schema); returns the final JSON text."""
    exe = codex_bin()
    if not exe:
        raise RuntimeError("Codex CLI not found. Install/update the ChatGPT app or set CODEX_BIN.")
    with tempfile.TemporaryDirectory(prefix="newsletter-") as tmp:
        schema, out = Path(tmp) / "schema.json", Path(tmp) / "issue.json"
        schema.write_text(json.dumps(schema_obj or SCHEMA))
        cmd = [exe, "--search", "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only",
               "-c", f'model_reasoning_effort="{effort}"', "--output-schema", str(schema), "-o", str(out), prompt]
        # stdin closed: otherwise codex waits for extra input when not run from a terminal.
        r = subprocess.run(cmd, cwd=tmp, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=CODEX_TIMEOUT)
        searches = r.stdout.count("web search:") + r.stderr.count("web search:")
        if r.returncode != 0 or not out.exists():
            tail = (r.stderr or r.stdout).strip()[-800:]
            raise RuntimeError(f"codex exited {r.returncode}: {tail}")
        log(f"Codex finished ({searches} web searches)")
        return out.read_text()


def call_openai(prompt, model, key, structured=True):
    body = {"model": model, "tools": [{"type": "web_search"}], "input": prompt}
    if structured:
        body["text"] = {"format": {"type": "json_schema", "name": "issue", "schema": SCHEMA, "strict": True}}
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def output_text(resp):
    chunks = []
    for item in resp.get("output", []):
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    chunks.append(c.get("text", ""))
    return "".join(chunks).strip()


def parse_issue(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    data = json.loads(text[start:end + 1])
    items = [it for it in data.get("items", []) if isinstance(it, dict) and it.get("title")]
    if not data.get("headline") or not items:
        raise ValueError("issue has no headline or items")
    data["items"] = items
    return data


def to_markdown(issue):
    out = [f"# {issue['headline']}", "", issue.get("intro", ""), ""]
    for i, it in enumerate(issue["items"], 1):
        title = f"[{it['title']}]({it['url']})" if it.get("url") else it["title"]
        tag = f" — {it['tag']}" if it.get("tag") else ""
        out += [f"## {i}. {title}{tag}", it.get("summary", ""), ""]
        if it.get("why"):
            out.append(f"- **Why:** {it['why']}")
        out += [f"- **{d['label']}:** {d['text']}" for d in it.get("details", []) if d.get("label")]
        out.append("")
    for sec in issue.get("sections", []):
        out += [f"## {sec['title']}", sec.get("body", ""), ""]
    if issue.get("for_you"):
        out += ["## For you", issue["for_you"], ""]
    return "\n".join(out)


def generate_with_api(prompt):
    load_env()
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set in ~/DailyHub/.env")
    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_API_MODEL
    try:
        resp = call_openai(prompt, model, key)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if "insufficient_quota" in body or "credit_balance_exhausted" in body:
            raise RuntimeError("OpenAI API has no credits (API billing is separate from ChatGPT Plus).") from None
        raise RuntimeError(f"HTTP {e.code}: {body[:600]}") from None
    return parse_issue(output_text(resp)), resp.get("model", model)


def main():
    load_env()
    backend = os.environ.get("NEWSLETTER_BACKEND", "codex").strip().lower()
    prompt = build_prompt()
    log(f"Writing issue with {'ChatGPT via Codex' if backend == 'codex' else 'OpenAI API'} ({len(prompt)} chars of instructions)")

    issue, model, last_err = None, None, None
    for attempt in (1, 2):
        try:
            if backend == "codex":
                issue, model = parse_issue(call_codex(prompt)), "ChatGPT (Codex)"
            else:
                issue, model = generate_with_api(prompt)
            break
        except subprocess.TimeoutExpired:
            last_err = f"Codex took longer than {CODEX_TIMEOUT // 60} minutes"
        except Exception as e:  # login expired, usage limit, network, malformed output…
            last_err = str(e)
        log(f"Attempt {attempt} failed: {last_err}")
        if "credits" in (last_err or "") or "not found" in (last_err or "") or "not set" in (last_err or ""):
            break  # retrying will not help
        time.sleep(20)
    if issue is None:
        log(f"ERROR: no issue generated. Last error: {last_err}")
        return 1

    today = date.today().isoformat()
    out_dir = NEWS / today
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "issue.json"
    if target.exists():  # never overwrite an earlier run; keep it next to the new one
        target.rename(out_dir / f"issue_{datetime.now():%H%M}_previous.json")
    issue.update({"date": today, "model": model, "generatedAt": datetime.now().astimezone().isoformat()})
    target.write_text(json.dumps(issue, ensure_ascii=False, indent=2) + "\n")
    (out_dir / "issue.md").write_text(to_markdown(issue))
    log(f"Wrote {target.relative_to(ROOT)}: {len(issue['items'])} items")
    return 0

if __name__ == "__main__":
    sys.exit(main())
