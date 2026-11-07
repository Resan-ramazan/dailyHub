"use server";
import { spawn } from "node:child_process";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { MINE_ID, ROOT, STATUSES, deleteMyJob, readMyJob, readTracker, saveMyJob, setTrackerStatus } from "@/lib/jobs";
import { ID_RE, addFeedback, createLecture, deleteCard, deleteLecture, gradeCard, patchTrack, readLecture, readTrack, setLectureStatus } from "@/lib/learn";
import { addHabit, deleteHabit, mutateStudy, toggleHabit, updateHabit } from "@/lib/routine";
import { addDays, localDate, newId } from "@/lib/store";
import { type Priority, addTodo, deleteTodo, patchTodo, readTodos } from "@/lib/todos";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
const PRIORITIES: Priority[] = ["high", "normal", "low"];
const prio = (v: unknown): Priority => (PRIORITIES.includes(v as Priority) ? (v as Priority) : "normal");
const refresh = () => revalidatePath("/", "layout");

// ---------- Jobs ----------
export async function updateStatus(jobDate: string, folder: string, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error("Unknown status");
  const job = (await readTracker()).find((j) => j.date === jobDate && j.folder === folder);
  await setTrackerStatus(jobDate, folder, status);
  // Applying starts a follow-up clock: one todo per job, due a week later.
  if (job && status === "applied" && job.status !== "applied") {
    const todos = await readTodos();
    const exists = todos.some((t) => t.jobRef?.folder === folder && t.jobRef.date === jobDate && t.title.startsWith("Follow up"));
    if (!exists) {
      await addTodo({
        title: `Follow up with ${job.company}: ${job.title}`,
        due: addDays(localDate(), 7),
        jobRef: { date: jobDate, folder, company: job.company },
      });
    }
  }
  refresh();
}

/** Starts the same script launchd runs, detached, so it keeps going if the page is closed. */
export async function runNow(kind: "jobs" | "news" | "learn" = "jobs") {
  const script = { jobs: "automation/run_daily.sh", news: "newsletter/run_daily.sh", learn: "learn/run_daily.sh" }[kind] ?? "automation/run_daily.sh";
  const child = spawn("/bin/zsh", [path.join(ROOT, script)], { cwd: ROOT, detached: true, stdio: "ignore" });
  child.unref();
  revalidatePath("/system");
  return { pid: child.pid ?? null };
}

// ---------- My jobs ----------
function startCustom(id: string) {
  const child = spawn("/bin/zsh", [path.join(ROOT, "automation/run_custom.sh"), id], { cwd: ROOT, detached: true, stdio: "ignore" });
  child.unref();
}

/** Queues a job the candidate found on their own; Claude tailors a CV and cover letter for it in the background. */
export async function submitMyJob(input: { url?: string; text?: string; note?: string }) {
  const url = String(input.url ?? "").trim().slice(0, 1000);
  const text = String(input.text ?? "").trim().slice(0, 60_000);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new Error("The link must start with http:// or https://");
  if (!url && text.length < 200) throw new Error("Paste a link, or the ad text (at least 200 characters).");
  const now = new Date();
  const id = `${localDate()}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}-${newId().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
  if (!MINE_ID.test(id)) throw new Error("Could not create an id");
  await saveMyJob({ id, created: now.toISOString(), date: localDate(), url, note, hasText: !!text, status: "pending" }, text || undefined);
  startCustom(id);
  revalidatePath("/jobs", "layout");
  return { id };
}

export async function retryMyJob(id: string) {
  const j = await readMyJob(String(id));
  if (!j || j.status === "running") return;
  await saveMyJob({ ...j, status: "pending", error: undefined });
  startCustom(j.id);
  revalidatePath("/jobs", "layout");
}

export async function removeMyJob(id: string) {
  await deleteMyJob(String(id));
  revalidatePath("/jobs", "layout");
}

// ---------- Todos ----------
export async function createTodo(input: { title: string; due?: string | null; priority?: string; pinned?: boolean; jobRef?: { date: string; folder: string; company: string } | null }) {
  await addTodo({
    title: String(input.title ?? ""),
    due: date(input.due),
    priority: prio(input.priority),
    pinned: !!input.pinned,
    jobRef: input.jobRef && date(input.jobRef.date) ? { date: input.jobRef.date, folder: String(input.jobRef.folder), company: String(input.jobRef.company) } : null,
  });
  refresh();
}

export async function editTodo(id: string, patch: { title?: string; due?: string | null; priority?: string; pinned?: boolean; done?: boolean }) {
  await patchTodo(String(id), {
    ...(patch.title !== undefined && { title: String(patch.title) }),
    ...(patch.due !== undefined && { due: date(patch.due) }),
    ...(patch.priority !== undefined && { priority: prio(patch.priority) }),
    ...(patch.pinned !== undefined && { pinned: !!patch.pinned }),
    ...(patch.done !== undefined && { done: !!patch.done }),
  });
  refresh();
}

export async function removeTodo(id: string) {
  await deleteTodo(String(id));
  refresh();
}

// ---------- Habits ----------
export async function checkHabit(id: string, day?: string) {
  await toggleHabit(String(id), date(day) ?? localDate());
  refresh();
}

const cleanDays = (days: unknown) => (Array.isArray(days) ? [...new Set(days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : []);

export async function createHabit(name: string, days: number[]) {
  await addHabit(String(name ?? ""), cleanDays(days));
  refresh();
}

export async function editHabit(id: string, patch: { name?: string; days?: number[] }) {
  await updateHabit(String(id), { ...(patch.name !== undefined && { name: String(patch.name) }), ...(patch.days !== undefined && { days: cleanDays(patch.days) }) });
  refresh();
}

export async function removeHabit(id: string) {
  await deleteHabit(String(id));
  refresh();
}

// ---------- Study planner ----------
type StudyKind = "courses" | "goals" | "deadlines" | "sessions";
const KINDS: StudyKind[] = ["courses", "goals", "deadlines", "sessions"];

export async function addStudy(kind: StudyKind, input: { name?: string; title?: string; courseId?: string | null; date?: string; minutes?: number; source?: string }) {
  if (!KINDS.includes(kind)) throw new Error("Unknown kind");
  const text = String(input.name ?? input.title ?? "").trim().slice(0, 160);
  if (!text) throw new Error("Text is required");
  const courseId = input.courseId ? String(input.courseId) : null;
  await mutateStudy((d) => {
    const id = newId();
    if (kind === "courses") d.courses.push({ id, name: text });
    if (kind === "goals") {
      if (d.goals.some((g) => !g.done && g.title.toLowerCase() === text.toLowerCase())) return;
      d.goals.push({ id, title: text, courseId, done: false, source: input.source === "skill-gap" ? "skill-gap" : "manual" });
    }
    if (kind === "deadlines") d.deadlines.push({ id, title: text, courseId, date: date(input.date) ?? localDate(), done: false });
    if (kind === "sessions") d.sessions.push({ id, title: text, courseId, date: date(input.date) ?? localDate(), minutes: Math.min(600, Math.max(5, Math.round(Number(input.minutes) || 45))), done: false });
  });
  refresh();
}

export async function toggleStudy(kind: Exclude<StudyKind, "courses">, id: string) {
  await mutateStudy((d) => {
    const item = (d[kind] as { id: string; done: boolean }[]).find((x) => x.id === id);
    if (item) item.done = !item.done;
  });
  refresh();
}

export async function removeStudy(kind: StudyKind, id: string) {
  if (!KINDS.includes(kind)) throw new Error("Unknown kind");
  await mutateStudy((d) => {
    (d as Record<StudyKind, { id: string }[]>)[kind] = d[kind].filter((x) => x.id !== id);
    if (kind === "courses") for (const k of ["goals", "deadlines", "sessions"] as const) for (const x of d[k]) if (x.courseId === id) x.courseId = null;
  });
  refresh();
}

// ---------- Learn ----------
const DIFFICULTIES = ["easy", "ok", "hard"] as const;

export async function saveTrack(id: string, patch: { name?: string; instructions?: string; language?: string; minutes?: number; active?: boolean }) {
  await patchTrack(String(id), {
    ...(typeof patch.name === "string" && { name: patch.name }),
    ...(typeof patch.instructions === "string" && { instructions: patch.instructions }),
    ...(typeof patch.language === "string" && { language: patch.language }),
    ...(patch.minutes !== undefined && { minutes: Number(patch.minutes) }),
    ...(patch.active !== undefined && { active: !!patch.active }),
  });
  refresh();
}

/** Marks a lesson or lecture as studied: feedback goes into the track's memory (the next lesson adapts),
 *  and the time is logged as a done study session so Routine's weekly minutes count it. */
export async function finishLesson(trackId: string, input: { date: string; difficulty: string; note?: string; minutes?: number; ref?: string; title?: string }) {
  const track = await readTrack(String(trackId));
  if (!track) throw new Error("Unknown track");
  const day = date(input.date) ?? localDate();
  const difficulty = DIFFICULTIES.includes(input.difficulty as never) ? (input.difficulty as (typeof DIFFICULTIES)[number]) : "ok";
  const minutes = Math.min(600, Math.max(5, Math.round(Number(input.minutes) || track.minutes || 30)));
  const ref = input.ref && ID_RE.test(input.ref) ? input.ref : undefined;
  await addFeedback(track.id, { date: day, difficulty, note: String(input.note ?? "").trim().slice(0, 1000), minutes, ...(ref && { ref }) });
  const title = `${track.name}: ${String(input.title ?? "lesson").slice(0, 120)}`;
  await mutateStudy((d) => {
    let course = d.courses.find((c) => c.name.toLowerCase() === track.name.toLowerCase());
    if (!course) { course = { id: newId(), name: track.name }; d.courses.push(course); }
    if (d.sessions.some((s) => s.title === title && s.date === day)) return;
    d.sessions.push({ id: newId(), title, courseId: course.id, date: day, minutes, done: true });
  });
  refresh();
}

export async function reviewCard(id: string, knew: boolean) {
  await gradeCard(String(id), !!knew);
  revalidatePath("/learn", "layout");
  revalidatePath("/");
}

export async function removeCard(id: string) {
  await deleteCard(String(id));
  refresh();
}

const MAX_TRANSCRIPT = 200_000;

function startLecture(id: string) {
  const child = spawn("/bin/zsh", [path.join(ROOT, "learn/run_lecture.sh"), id], { cwd: ROOT, detached: true, stdio: "ignore" });
  child.unref();
}

export async function submitLecture(input: { trackId: string; title?: string; transcript: string; date?: string }) {
  const track = await readTrack(String(input.trackId));
  if (!track || track.kind !== "lecture") throw new Error("Pick a lecture track");
  const transcript = String(input.transcript ?? "").trim();
  if (transcript.length < 200) throw new Error("The transcript is too short (at least 200 characters).");
  if (transcript.length > MAX_TRANSCRIPT) throw new Error("The transcript is too long (max 200,000 characters). Split it into parts.");
  const id = await createLecture(track.id, String(input.title ?? "").trim().slice(0, 120), transcript, date(input.date) ?? localDate());
  startLecture(id);
  refresh();
  return { id };
}

export async function retryLecture(id: string) {
  const l = await readLecture(String(id));
  if (!l || l.meta.status === "running") return;
  await setLectureStatus(l.meta.id, "pending");
  startLecture(l.meta.id);
  refresh();
}

export async function removeLecture(id: string) {
  await deleteLecture(String(id));
  refresh();
}
