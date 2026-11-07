import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PERSONAL_DIR, ROOT, addDays, lastRunSummary, localDate, readAgentSchedule, readJson, readRunLogs, safePath, updateJson, writeJson } from "./store";

// Files are shared with learn/generate.py (Python writes lessons, notes and new cards; the Hub writes feedback and reviews).
export const LEARN_DIR = path.join(ROOT, "Lessons");
const TRACKS_DIR = path.join(LEARN_DIR, "tracks");
const LECTURES_DIR = path.join(LEARN_DIR, "lectures");
const LOG_DIR = path.join(LEARN_DIR, "logs");
const CARDS = path.join(PERSONAL_DIR, "cards.json");
const DEFAULTS = path.join(ROOT, "learn", "default_tracks.json");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export type Track = { id: string; name: string; kind: "daily" | "lecture"; language: string; minutes: number; active: boolean; instructions: string };
export type Feedback = { date: string; difficulty: "easy" | "ok" | "hard"; note: string; minutes?: number; ref?: string };
export type Memory = { level: string; covered: { date: string; topic: string }[]; feedback: Feedback[]; next_hint?: string };
export type QuizItem = { q: string; options: string[]; answer: number; why: string };
export type CardIn = { front: string; back: string; example: string };
export type Block = { kind: string; title: string; body: string; url: string };
export type Lesson = {
  date: string; trackId: string; title: string; summary: string; minutes: number; progress: string;
  blocks: Block[]; cards: CardIn[]; quiz: QuizItem[]; covered_topics: string[]; next_hint: string; generatedAt?: string;
};
export type Note = {
  title: string; tldr: string; sections: { title: string; body: string }[]; key_terms: { term: string; meaning: string }[];
  exam_focus: string; quiz: QuizItem[]; cards: CardIn[]; open_questions: string[]; generatedAt?: string;
};
export type LectureMeta = { id: string; trackId: string; title: string; date: string; status: "pending" | "running" | "ready" | "failed"; error?: string | null; createdAt: string; chars: number };
export type Card = { id: string; trackId: string; front: string; back: string; example: string; source: string; box: number; due: string; reviews: number; lapses: number; createdAt: string; lastReviewed?: string };

// ---------- Tracks ----------
const trackFile = (id: string) => safePath(TRACKS_DIR, id, "track.json");
const memoryFile = (id: string) => safePath(TRACKS_DIR, id, "memory.json");

/** All tracks; writes the starter tracks the first time (never overwrites edits). */
export async function readTracks(): Promise<Track[]> {
  const defaults = await readJson<Track[]>(DEFAULTS, []);
  for (const t of defaults) {
    try { await fs.access(trackFile(t.id)); } catch { await writeJson(trackFile(t.id), t); }
  }
  const dirs = await fs.readdir(TRACKS_DIR, { withFileTypes: true }).catch(() => []);
  const tracks = await Promise.all(dirs.filter((d) => d.isDirectory() && ID_RE.test(d.name)).map((d) => readJson<Track | null>(trackFile(d.name), null).catch(() => null)));
  const order = defaults.map((t) => t.id);
  return tracks.filter((t): t is Track => !!t && ID_RE.test(t.id))
    .sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99) || a.name.localeCompare(b.name));
}

export async function readTrack(id: string) {
  if (!ID_RE.test(id)) return null;
  return (await readTracks()).find((t) => t.id === id) ?? null;
}

export async function patchTrack(id: string, patch: Partial<Pick<Track, "name" | "instructions" | "language" | "minutes" | "active">>) {
  if (!ID_RE.test(id)) throw new Error("Bad track id");
  await updateJson<Track | null>(trackFile(id), null, (t) => {
    if (!t) throw new Error("Track not found");
    if (patch.name?.trim()) t.name = patch.name.trim().slice(0, 80);
    if (patch.instructions !== undefined) t.instructions = patch.instructions.slice(0, 20000);
    if (patch.language !== undefined) t.language = patch.language.slice(0, 1000);
    if (patch.minutes !== undefined) t.minutes = Math.min(300, Math.max(5, Math.round(patch.minutes) || 30));
    if (patch.active !== undefined) t.active = patch.active;
  });
}

const EMPTY_MEMORY: Memory = { level: "", covered: [], feedback: [] };
export const readMemory = async (id: string) => ({ ...EMPTY_MEMORY, ...(await readJson<Partial<Memory>>(memoryFile(id), {})) }) as Memory;

/** Feedback doubles as "done": one entry per lesson (date for daily lessons, ref for lectures). */
export async function addFeedback(id: string, fb: Feedback) {
  await updateJson<Memory>(memoryFile(id), structuredClone(EMPTY_MEMORY), (m) => {
    m.feedback ??= [];
    m.feedback = m.feedback.filter((f) => !(f.date === fb.date && (f.ref ?? null) === (fb.ref ?? null)));
    m.feedback.push(fb);
    m.feedback = m.feedback.slice(-200);
  });
}

// ---------- Daily lessons ----------
export async function readLesson(date: string, trackId: string): Promise<Lesson | null> {
  if (!DATE_RE.test(date) || !ID_RE.test(trackId)) return null;
  const l = await readJson<Lesson | null>(safePath(LEARN_DIR, date, `${trackId}.json`), null).catch(() => null);
  if (!l || !Array.isArray(l.blocks)) return null;
  l.blocks = l.blocks.map((b) => ({ ...b, url: /^https?:\/\//i.test(b.url ?? "") ? b.url : "" }));
  l.quiz = (l.quiz ?? []).filter((q) => Array.isArray(q.options) && q.answer >= 0 && q.answer < q.options.length);
  return l;
}

/** Dates that have a lesson for this track, newest first. */
export async function lessonDates(trackId: string) {
  const dirs = (await fs.readdir(LEARN_DIR).catch(() => [] as string[])).filter((d) => DATE_RE.test(d)).sort().reverse();
  const out: string[] = [];
  for (const d of dirs) {
    try { await fs.access(path.join(LEARN_DIR, d, `${trackId}.json`)); out.push(d); } catch {}
  }
  return out;
}

// ---------- Lectures ----------
export async function listLectures(trackId?: string): Promise<LectureMeta[]> {
  const dirs = await fs.readdir(LECTURES_DIR, { withFileTypes: true }).catch(() => []);
  const metas = await Promise.all(dirs.filter((d) => d.isDirectory() && ID_RE.test(d.name)).map((d) => readJson<LectureMeta | null>(path.join(LECTURES_DIR, d.name, "meta.json"), null).catch(() => null)));
  return metas.filter((m): m is LectureMeta => !!m && (!trackId || m.trackId === trackId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readLecture(id: string) {
  if (!ID_RE.test(id)) return null;
  const meta = await readJson<LectureMeta | null>(safePath(LECTURES_DIR, id, "meta.json"), null).catch(() => null);
  if (!meta) return null;
  const note = meta.status === "ready" ? await readJson<Note | null>(safePath(LECTURES_DIR, id, "note.json"), null).catch(() => null) : null;
  if (note) note.quiz = (note.quiz ?? []).filter((q) => Array.isArray(q.options) && q.answer >= 0 && q.answer < q.options.length);
  return { meta, note };
}

export async function createLecture(trackId: string, title: string, transcript: string, date: string) {
  const slug = (title || "lecture").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lecture";
  const id = `${date}-${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = safePath(LECTURES_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "transcript.txt"), transcript, "utf8");
  const meta: LectureMeta = { id, trackId, title, date, status: "pending", error: null, createdAt: new Date().toISOString(), chars: transcript.length };
  await writeJson(path.join(dir, "meta.json"), meta);
  return id;
}

export async function setLectureStatus(id: string, status: LectureMeta["status"]) {
  await updateJson<LectureMeta | null>(safePath(LECTURES_DIR, id, "meta.json"), null, (m) => { if (m) { m.status = status; m.error = null; } });
}

export async function deleteLecture(id: string) {
  if (!ID_RE.test(id)) throw new Error("Bad id");
  await fs.rm(safePath(LECTURES_DIR, id), { recursive: true, force: true });
}

// ---------- Flashcards (Leitner boxes) ----------
const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until the next review, by box

export const readCards = () => readJson<Card[]>(CARDS, []);
export const dueCards = (cards: Card[], today = localDate()) => cards.filter((c) => c.due <= today).sort((a, b) => a.box - b.box || a.due.localeCompare(b.due));

export async function gradeCard(id: string, knew: boolean, today = localDate()) {
  await updateJson<Card[]>(CARDS, [], (list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return;
    c.reviews = (c.reviews ?? 0) + 1;
    c.lastReviewed = today;
    if (knew) {
      c.box = Math.min(INTERVALS.length - 1, (c.box ?? 0) + 1);
      c.due = addDays(today, INTERVALS[c.box]);
    } else {
      c.box = 0;
      c.lapses = (c.lapses ?? 0) + 1;
      c.due = addDays(today, 1);
    }
  });
}

export async function deleteCard(id: string) {
  await updateJson<Card[]>(CARDS, [], (list) => list.filter((c) => c.id !== id));
}

// ---------- Overview for /learn and Today ----------
export async function learnToday(today = localDate()) {
  const [tracks, cards, lectures] = await Promise.all([readTracks(), readCards(), listLectures()]);
  const daily = await Promise.all(
    tracks.filter((t) => t.kind === "daily" && t.active).map(async (t) => {
      const [lesson, mem] = await Promise.all([readLesson(today, t.id), readMemory(t.id)]);
      return { track: t, lesson, done: mem.feedback.some((f) => f.date === today && !f.ref), level: mem.level };
    }),
  );
  return { tracks, daily, due: dueCards(cards, today).length, totalCards: cards.length, lectures };
}

export const readLearnSchedule = () => readAgentSchedule("com.dailyhub.learn", { hour: 7, minute: 0 });

export async function readLearnLogs() {
  const logs = await readRunLogs(LOG_DIR);
  return { ...logs, run: lastRunSummary(logs.latest) };
}
