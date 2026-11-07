import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Project root: the dashboard lives in <root>/dashboard. */
export const ROOT = path.resolve(process.cwd(), "..");
export const PERSONAL_DIR = path.join(ROOT, "Personal");

/** Resolves a path inside `base` and refuses anything that escapes it. */
export function safePath(base: string, ...segs: string[]) {
  const p = path.resolve(base, ...segs);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error("Path outside allowed folder");
  return p;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e; // a corrupt file should be loud, not silently replaced
  }
}

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

// Serialise read-modify-write per file so two quick clicks can't lose an update.
const locks = new Map<string, Promise<unknown>>();
export async function updateJson<T>(file: string, fallback: T, fn: (data: T) => T | void): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const data = await readJson<T>(file, fallback);
    const out = (fn(data) ?? data) as T;
    await writeJson(file, out);
    return out;
  });
  locks.set(file, next);
  try { return await next; } finally { if (locks.get(file) === next) locks.delete(file); }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Local calendar date (YYYY-MM-DD) on this Mac, not UTC. */
export function localDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** Reads Hour/Minute from an installed LaunchAgent, falling back to the repo copy. */
export async function readAgentSchedule(label: string, fallback: { hour: number; minute: number }) {
  const installed = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);
  const repo = path.join(ROOT, "automation", `${label}.plist`);
  for (const [file, isInstalled] of [[installed, true], [repo, false]] as const) {
    try {
      const xml = await fs.readFile(file, "utf8");
      const hour = Number(xml.match(/<key>Hour<\/key>\s*<integer>(\d+)/)?.[1] ?? fallback.hour);
      const minute = Number(xml.match(/<key>Minute<\/key>\s*<integer>(\d+)/)?.[1] ?? fallback.minute);
      return { hour, minute, installed: isInstalled };
    } catch {}
  }
  return { ...fallback, installed: false };
}

/** Tail of the newest dated log in a folder plus a summary of the last run. */
export async function readRunLogs(dir: string, lines = 80) {
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => /^\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort().reverse();
  const latestName = names[0] ?? null;
  let latest = "";
  if (latestName) {
    try { latest = (await fs.readFile(path.join(dir, latestName), "utf8")).split("\n").slice(-lines).join("\n").trim(); } catch {}
  }
  return { latestName, latest, all: names };
}

export type RunState = { state: "ok" | "failed" | "running" | "none"; start?: string; end?: string };
export function lastRunSummary(log: string): RunState {
  const starts = [...log.matchAll(/=== (.+?) start ===/g)];
  if (!starts.length) return { state: "none" };
  const last = starts[starts.length - 1];
  const after = log.slice(last.index!);
  // Use the LAST end line: a stopped older run can write its own "end" after the new run's "start".
  const ends = [...after.matchAll(/=== (.+?) end \(exit (\d+)\) ===/g)];
  const end = ends[ends.length - 1];
  if (!end) return { state: "running", start: last[1] };
  return { state: end[2] === "0" ? "ok" : "failed", start: last[1], end: end[1] };
}
