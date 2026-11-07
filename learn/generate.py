#!/usr/bin/env python3
"""Learn: daily lessons and lecture notes, written by ChatGPT (Codex CLI on the ChatGPT plan).

Each track replaces one ChatGPT project. Its instructions live in
Lessons/tracks/<id>/track.json and its memory (topics covered, level, your
feedback) in Lessons/tracks/<id>/memory.json; the memory goes into every prompt
so the next lesson continues where the last one stopped.

Usage:
  python3 learn/generate.py daily [--force] [--track ID]   # today's lesson for every active daily track
  python3 learn/generate.py lecture LECTURE_ID              # re-teach a pasted lecture transcript
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

import time
import uuid
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEARN = ROOT / "Lessons"
TRACKS = LEARN / "tracks"
LECTURES = LEARN / "lectures"
CARDS = ROOT / "Personal" / "cards.json"
DEFAULTS = Path(__file__).resolve().parent / "default_tracks.json"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")

# Reuse the newsletter's Codex plumbing (loaded by path: both files are called generate.py).
_spec = importlib.util.spec_from_file_location("newsletter_generate", ROOT / "newsletter" / "generate.py")
nl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nl)
log, load_env, call_codex = nl.log, nl.load_env, nl.call_codex

QUIZ = {
    "type": "array",
    "description": "Multiple-choice questions",
    "items": {
        "type": "object", "additionalProperties": False, "required": ["q", "options", "answer", "why"],
        "properties": {
            "q": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}, "description": "3-4 options"},
            "answer": {"type": "integer", "description": "0-based index of the correct option"},
            "why": {"type": "string", "description": "One sentence: why that answer is right"},
        },
    },
}
CARDS_SCHEMA = {
    "type": "array",
    "description": "Flashcards for spaced repetition",
    "items": {
        "type": "object", "additionalProperties": False, "required": ["front", "back", "example"],
        "properties": {
            "front": {"type": "string", "description": "Word or concept (for German: with article, e.g. 'die Erfahrung')"},
            "back": {"type": "string", "description": "Meaning / short answer"},
            "example": {"type": "string", "description": "Example sentence or usage; empty string if none"},
        },
    },
}
LESSON_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["title", "summary", "minutes", "progress", "blocks", "cards", "quiz", "covered_topics", "next_hint"],
    "properties": {
        "title": {"type": "string", "description": "Today's lesson title"},
        "summary": {"type": "string", "description": "One or two sentences: what today is about"},
        "minutes": {"type": "integer", "description": "Realistic total study time in minutes"},
        "progress": {"type": "string", "description": "Where the learner stands now (level / roadmap stage and how long it will take), 1-2 sentences"},
        "blocks": {
            "type": "array", "description": "The lesson parts in order",
            "items": {
                "type": "object", "additionalProperties": False, "required": ["kind", "title", "body", "url"],
                "properties": {
                    "kind": {"type": "string", "enum": ["explanation", "grammar", "vocab", "listening", "reading", "task", "exercise", "resource", "project"]},
                    "title": {"type": "string"},
                    "body": {"type": "string", "description": "Markdown (tables, lists, code blocks allowed)"},
                    "url": {"type": "string", "description": "Direct working link for listening/reading/resource blocks; empty string otherwise"},
                },
            },
        },
        "cards": CARDS_SCHEMA,
        "quiz": QUIZ,
        "covered_topics": {"type": "array", "items": {"type": "string"}, "description": "Short names of the topics taught today, for the learner's memory"},
        "next_hint": {"type": "string", "description": "One sentence: what comes next time"},
    },
}
NOTE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["title", "tldr", "sections", "key_terms", "exam_focus", "quiz", "cards", "open_questions"],
    "properties": {
        "title": {"type": "string", "description": "Lecture topic as a clear title"},
        "tldr": {"type": "string", "description": "3-5 sentence summary"},
        "sections": {
            "type": "array", "description": "The lecture re-taught from zero, in order",
            "items": {"type": "object", "additionalProperties": False, "required": ["title", "body"],
                      "properties": {"title": {"type": "string"}, "body": {"type": "string", "description": "Markdown"}}},
        },
        "key_terms": {
            "type": "array",
            "items": {"type": "object", "additionalProperties": False, "required": ["term", "meaning"],
                      "properties": {"term": {"type": "string"}, "meaning": {"type": "string"}}},
        },
        "exam_focus": {"type": "string", "description": "Markdown: what is most likely exam-relevant"},
        "quiz": QUIZ,
        "cards": CARDS_SCHEMA,
        "open_questions": {"type": "array", "items": {"type": "string"}, "description": "Parts the transcript left unclear, worth asking the lecturer"},
    },
}


# ---------- small JSON store ----------
def read_json(path, fallback):
    try:
        return json.loads(Path(path).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(path)


def ensure_tracks():
    """Creates the starter tracks the first time; never overwrites your edits."""
    for t in json.loads(DEFAULTS.read_text()):
        f = TRACKS / t["id"] / "track.json"
        if not f.exists():
            write_json(f, t)


def load_tracks():
    ensure_tracks()
    out = []
    for f in sorted(TRACKS.glob("*/track.json")):
        t = read_json(f, None)
        if t and ID_RE.match(str(t.get("id", ""))):
            out.append(t)
    return out


def memory_path(track_id):
    return TRACKS / track_id / "memory.json"


def read_memory(track_id):
    m = read_json(memory_path(track_id), {})
    m.setdefault("level", "")
    m.setdefault("covered", [])
    m.setdefault("feedback", [])
    return m


# ---------- cards ----------
def add_cards(track_id, cards, source, today):
    data = read_json(CARDS, [])
    seen = {(c["trackId"], c["front"].strip().lower()) for c in data}
    added = 0
    for c in cards:
        front, back = str(c.get("front", "")).strip(), str(c.get("back", "")).strip()
        if not front or not back or (track_id, front.lower()) in seen:
            continue
        seen.add((track_id, front.lower()))
        data.append({
            "id": uuid.uuid4().hex[:12], "trackId": track_id, "front": front[:200], "back": back[:400],
            "example": str(c.get("example", "")).strip()[:400], "source": source,
            "box": 0, "due": today, "reviews": 0, "lapses": 0, "createdAt": datetime.now().astimezone().isoformat(),
        })
        added += 1
    write_json(CARDS, data)
    return added


def weak_cards(track_id, limit=12):
    data = [c for c in read_json(CARDS, []) if c.get("trackId") == track_id and c.get("lapses", 0) > 0 and c.get("box", 0) <= 1]
    data.sort(key=lambda c: -c.get("lapses", 0))
    return [c["front"] for c in data[:limit]]


# ---------- prompts ----------
def clean_links(blocks):
    for b in blocks:
        if not re.match(r"^https?://", str(b.get("url", "")), re.I):
            b["url"] = ""
    return blocks


def memory_text(track_id, mem):
    parts = []
    if mem.get("level"):
        parts.append(f"Learner's current level / stage (from your last lesson): {mem['level']}")
    if mem["covered"]:
        recent = mem["covered"][-25:]
        parts.append("Already taught (oldest first, do not repeat unless reviewing):\n- " + "\n- ".join(f"{c['date']}: {c['topic']}" for c in recent))
    if mem["feedback"]:
        parts.append("The learner's feedback on recent lessons (adapt pace and review what was hard):\n- " + "\n- ".join(
            f"{f['date']} ({f.get('difficulty', '?')}): {f.get('note') or 'no comment'}" for f in mem["feedback"][-8:]))
    weak = weak_cards(track_id)
    if weak:
        parts.append("Flashcards the learner keeps forgetting (weave a few into examples or the quiz):\n- " + "\n- ".join(weak))
    if mem.get("next_hint"):
        parts.append(f"Last time you said the next lesson would be: {mem['next_hint']}")
    return "\n\n".join(parts) or "This is the first lesson. Start at the right entry point for the level described in the instructions."


def daily_prompt(track, mem, today):
    strip = lambda s: re.sub(r"<!--.*?-->", "", s or "", flags=re.S).strip()
    return "\n\n".join([
        strip(track.get("instructions")),
        f"Today is {date.fromisoformat(today):%A, %d %B %Y}. Planned study time: about {track.get('minutes', 45)} minutes.",
        f"Language: {track.get('language') or 'Explain in English.'}",
        "## Memory of this course\n" + memory_text(track["id"], mem),
        "Use web search for every listening, reading or resource suggestion and give a direct working link in `url`. "
        "Never invent a link; leave `url` empty instead. Weekend days may be lighter and more project-like.",
        "Return the whole lesson as JSON matching the schema: the lesson parts in `blocks` (Markdown bodies), new words or concepts in `cards`, "
        "the quiz in `quiz`, short topic names in `covered_topics` and your assessment of the learner's stage in `progress`.",
    ])


def lecture_prompt(track, mem, title, transcript):
    strip = lambda s: re.sub(r"<!--.*?-->", "", s or "", flags=re.S).strip()
    covered = [c["topic"] for c in mem["covered"][-20:]]
    return "\n\n".join(filter(None, [
        strip(track.get("instructions")),
        f"Language: {track.get('language') or 'Explain in English.'}",
        f"Earlier lectures of this course (for context and links between topics): {', '.join(covered)}" if covered else "",
        f"Lecture title given by the student: {title}" if title else "",
        "Return JSON matching the schema: the full re-teaching in `sections` (Markdown, long and thorough is fine), "
        "8-15 flashcards in `cards`, 5-8 quiz questions in `quiz`.",
        "## Transcript\n" + transcript,
    ]))


def parse(text, required):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    data = json.loads(text[text.find("{"): text.rfind("}") + 1])
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise ValueError(f"model output is missing {', '.join(missing)}")
    data["quiz"] = [q for q in data.get("quiz", []) if q.get("options") and 0 <= int(q.get("answer", -1)) < len(q["options"])]
    return data


def run_codex(prompt, schema, required, effort):
    last = None
    for attempt in (1, 2):
        try:
            return parse(call_codex(prompt, schema, effort), required)
        except subprocess.TimeoutExpired:
            last = "Codex timed out"
        except Exception as e:  # login expired, usage limit, malformed output…
            last = str(e)
        log(f"Attempt {attempt} failed: {last}")
        if "not found" in last:
            break
        time.sleep(15)
    raise RuntimeError(last)


# ---------- markdown copies (readable on GitHub / phone) ----------
def quiz_md(quiz):
    out = ["## Quiz"]
    for i, q in enumerate(quiz, 1):
        out.append(f"{i}. {q['q']}")
        out += [f"   - {'**' if k == q['answer'] else ''}{o}{'**' if k == q['answer'] else ''}" for k, o in enumerate(q["options"])]
    return out


def lesson_md(track, lesson):
    out = [f"# {track['name']}: {lesson['title']}", "", lesson["summary"], "", f"_{lesson['progress']}_", ""]
    for b in lesson["blocks"]:
        out += [f"## {b['title']}" + (f" ([link]({b['url']}))" if b.get("url") else ""), b["body"], ""]
    if lesson["cards"]:
        out += ["## Cards", *[f"- **{c['front']}**: {c['back']}" for c in lesson["cards"]], ""]
    return "\n".join(out + quiz_md(lesson["quiz"]) + ["", f"**Next:** {lesson['next_hint']}"])


def note_md(note):
    out = [f"# {note['title']}", "", note["tldr"], ""]
    for s in note["sections"]:
        out += [f"## {s['title']}", s["body"], ""]
    out += ["## Key terms", *[f"- **{k['term']}**: {k['meaning']}" for k in note["key_terms"]], "", "## Exam focus", note["exam_focus"], ""]
    return "\n".join(out + quiz_md(note["quiz"]))


# ---------- modes ----------
def daily(force=False, only=None):
    today = date.today().isoformat()
    tracks = [t for t in load_tracks() if t.get("kind") == "daily" and t.get("active", True) and (not only or t["id"] == only)]
    failed = 0
    for t in tracks:
        target = LEARN / today / f"{t['id']}.json"
        if target.exists() and not force:
            log(f"{t['id']}: already have today's lesson, skipped")
            continue
        mem = read_memory(t["id"])
        prompt = daily_prompt(t, mem, today)
        log(f"{t['id']}: writing lesson ({len(prompt)} chars; {len(mem['covered'])} topics, {len(mem['feedback'])} feedback notes in memory)")
        try:
            lesson = run_codex(prompt, LESSON_SCHEMA, ["title", "blocks"], "medium")
        except Exception as e:
            log(f"ERROR {t['id']}: {e}")
            failed += 1
            continue
        lesson["blocks"] = clean_links(lesson["blocks"])
        lesson.update({"date": today, "trackId": t["id"], "model": "ChatGPT (Codex)", "generatedAt": datetime.now().astimezone().isoformat()})
        if target.exists():
            target.rename(target.with_name(f"{t['id']}_{datetime.now():%H%M}_previous.json"))
        write_json(target, lesson)
        (LEARN / today / f"{t['id']}.md").write_text(lesson_md(t, lesson))
        added = add_cards(t["id"], lesson.get("cards", []), today, today)
        mem["covered"] = (mem["covered"] + [{"date": today, "topic": x} for x in lesson.get("covered_topics", []) if x])[-200:]
        mem["level"] = lesson.get("progress") or mem["level"]
        mem["next_hint"] = lesson.get("next_hint", "")
        write_json(memory_path(t["id"]), mem)
        log(f"{t['id']}: wrote {target.parent.name}/{target.name} ({len(lesson['blocks'])} blocks, {added} new cards)")
    return 1 if failed else 0


def lecture(lecture_id):
    if not ID_RE.match(lecture_id):
        log("ERROR: bad lecture id")
        return 2
    folder = LECTURES / lecture_id
    meta = read_json(folder / "meta.json", None)
    transcript = (folder / "transcript.txt").read_text() if (folder / "transcript.txt").exists() else ""
    if not meta or not transcript.strip():
        log("ERROR: lecture not found or empty transcript")
        return 2
    track = next((t for t in load_tracks() if t["id"] == meta.get("trackId")), None)
    if not track:
        meta.update(status="failed", error="Unknown track")
        write_json(folder / "meta.json", meta)
        return 2
    meta.update(status="running", startedAt=datetime.now().astimezone().isoformat(), error=None)
    write_json(folder / "meta.json", meta)
    mem = read_memory(track["id"])
    log(f"lecture {lecture_id}: {track['id']}, {len(transcript)} chars of transcript")
    try:
        note = run_codex(lecture_prompt(track, mem, meta.get("title", ""), transcript), NOTE_SCHEMA, ["title", "sections"], "high")
    except Exception as e:
        log(f"ERROR lecture {lecture_id}: {e}")
        meta.update(status="failed", error=str(e)[:500])
        write_json(folder / "meta.json", meta)
        return 1
    note.update({"model": "ChatGPT (Codex)", "generatedAt": datetime.now().astimezone().isoformat()})
    write_json(folder / "note.json", note)
    (folder / "note.md").write_text(note_md(note))
    today = date.today().isoformat()
    added = add_cards(track["id"], note.get("cards", []), f"lecture:{lecture_id}", today)
    mem["covered"] = (mem["covered"] + [{"date": meta.get("date", today), "topic": note["title"]}])[-200:]
    write_json(memory_path(track["id"]), mem)
    meta.update(status="ready", title=meta.get("title") or note["title"], finishedAt=datetime.now().astimezone().isoformat())
    write_json(folder / "meta.json", meta)
    log(f"lecture {lecture_id}: ready ({len(note['sections'])} sections, {added} new cards)")
    return 0


def main(argv):
    load_env()
    if len(argv) >= 2 and argv[1] == "daily":
        only = argv[argv.index("--track") + 1] if "--track" in argv and argv.index("--track") + 1 < len(argv) else None
        return daily(force="--force" in argv, only=only)
    if len(argv) == 3 and argv[1] == "lecture":
        return lecture(argv[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
