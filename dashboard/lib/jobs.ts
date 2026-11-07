import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, lastRunSummary, readAgentSchedule, readRunLogs, safePath } from "./store";

export { ROOT, lastRunSummary };
export const JOBS_DIR = path.join(ROOT, "Jobs");
const TRACKER = path.join(JOBS_DIR, "tracker.csv");
const SEEN = path.join(JOBS_DIR, "seen_jobs.json");
const LOG_DIR = path.join(JOBS_DIR, "logs");

export const STATUSES = ["to apply", "applied", "interview", "offer", "rejected", "skipped", "REMOVED"] as const;
export type Status = (typeof STATUSES)[number];

export type TrackedJob = {
  date: string;
  rank: number;
  match: number;
  company: string;
  title: string;
  location: string;
  url: string;
  folder: string;
  status: string;
};

const HEADER = ["date", "rank", "matching_rate", "company", "title", "location", "url", "folder", "status"];

// ---------- CSV ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function readTracker(): Promise<TrackedJob[]> {
  let text: string;
  try { text = await fs.readFile(TRACKER, "utf8"); } catch { return []; }
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const idx = (k: string) => head.indexOf(k);
  return rows.map((r) => ({
    date: r[idx("date")] ?? "",
    rank: Number(r[idx("rank")]) || 0,
    match: Number(r[idx("matching_rate")]) || 0,
    company: r[idx("company")] ?? "",
    title: r[idx("title")] ?? "",
    location: r[idx("location")] ?? "",
    url: r[idx("url")] ?? "",
    folder: r[idx("folder")] ?? "",
    status: r[idx("status")] ?? "to apply",
  }));
}

/** Rewrites only the status column of one row; all other rows are kept as they are. */
export async function setTrackerStatus(date: string, folder: string, status: string) {
  const text = await fs.readFile(TRACKER, "utf8");
  const rows = parseCsv(text);
  const head = rows[0] ?? HEADER;
  const di = head.indexOf("date"), fi = head.indexOf("folder"), si = head.indexOf("status");
  let hit = false;
  for (const r of rows.slice(1)) {
    if (r[di] === date && r[fi] === folder) { r[si] = status; hit = true; }
  }
  if (!hit) throw new Error(`No tracker row for ${date}/${folder}`);
  const out = rows.map((r) => r.map(csvField).join(",")).join("\n") + "\n";
  const tmp = TRACKER + ".tmp";
  await fs.writeFile(tmp, out, "utf8");
  await fs.rename(tmp, TRACKER);
}

// ---------- Days & jobs ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_SEG = /^[\w.\-À-ɏ]+$/;

export async function listDays(): Promise<string[]> {
  const entries = await fs.readdir(JOBS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory() && DATE_RE.test(e.name)).map((e) => e.name).sort().reverse();
}

export async function readText(...segs: string[]): Promise<string | null> {
  try { return await fs.readFile(safeJobsPath(...segs), "utf8"); } catch { return null; }
}

export async function readDayReport(date: string) {
  if (!DATE_RE.test(date)) return null;
  return readText(date, "00_Daily_Report.md");
}

export async function countCandidates(date: string): Promise<number> {
  const entries = await fs.readdir(path.join(JOBS_DIR, date)).catch(() => [] as string[]);
  let n = 0;
  for (const f of entries.filter((e) => e.startsWith("raw_candidates"))) {
    try { n += (JSON.parse(await fs.readFile(path.join(JOBS_DIR, date, f), "utf8")) as unknown[]).length; } catch {}
  }
  return n;
}

export type JobFile = { name: string; kind: "cv" | "cover" | "other"; ext: string; href: string };

export async function readJob(date: string, folder: string) {
  if (!DATE_RE.test(date) || !SAFE_SEG.test(folder)) return null;
  const dir = safeJobsPath(date, folder);
  const names = await fs.readdir(dir).catch(() => null);
  if (!names) return null;
  const files: JobFile[] = names
    .filter((n) => !n.startsWith("."))
    .map((name) => {
      const ext = path.extname(name).slice(1).toLowerCase();
      const kind = /^cv_/i.test(name) ? "cv" : /^cover/i.test(name) ? "cover" : "other";
      return { name, ext, kind, href: `/api/files/${[date, folder, name].map(encodeURIComponent).join("/")}` };
    });
  const posting = await readText(date, folder, "job_posting.md");
  return { files, posting };
}

/** Resolves a path inside Jobs/ and refuses anything that escapes it. */
export const safeJobsPath = (...segs: string[]) => safePath(JOBS_DIR, ...segs);

export async function seenCount(): Promise<number> {
  try { return (JSON.parse(await fs.readFile(SEEN, "utf8")) as unknown[]).length; } catch { return 0; }
}

// ---------- Automation status ----------
export const readSchedule = () => readAgentSchedule("com.dailyhub.jobsearch", { hour: 8, minute: 30 });

export async function readLogs() {
  const logs = await readRunLogs(LOG_DIR);
  let launchdErr = "";
  try { launchdErr = (await fs.readFile(path.join(LOG_DIR, "launchd.err"), "utf8")).split("\n").slice(-20).join("\n").trim(); } catch {}
  return { ...logs, launchdErr };
}


// ---------- Report helpers ----------
/** Pulls one "## Heading" section out of a markdown report. */
export function mdSection(md: string, heading: string): string | null {
  const re = new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m");
  return md.match(re)?.[1].trim() ?? null;
}

/** Rows of the "All Jobs (scored)" table: match, role (markdown), company, location, reason. */
export function scoredJobs(md: string) {
  const sec = mdSection(md, "All Jobs");
  if (!sec) return [];
  return sec
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l) && !/^\|\s*Match\s*\|/.test(l))
    .map((l) => {
      const c = l.split("|").slice(1, -1).map((s) => s.trim());
      const link = c[1]?.match(/\[(.+?)\]\((.+?)\)/);
      const pct = Number(c[0]?.match(/(\d+)\s*%/)?.[1]);
      return {
        match: Number.isFinite(pct) ? pct : null,
        title: (link ? link[1] : c[1] ?? "").replace(/[*~]/g, ""),
        url: link?.[2] ?? null,
        company: c[2] ?? "",
        location: (c[3] ?? "").replace(/\*/g, ""),
        reason: (c[4] ?? "").replace(/\*/g, ""),
      };
    });
}

// ---------- My jobs (ads the candidate found on their own) ----------
// Each request is Jobs/mine/<id>.json (+ <id>.txt with the pasted ad). automation/run_custom.sh
// has Claude tailor a CV and cover letter into Jobs/<date>/M_<Company>_<Role>, then fills in folder/status.
export const MINE_DIR = path.join(JOBS_DIR, "mine");
export const MINE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

export type MyJob = {
  id: string;
  created: string;
  date: string;
  url: string;
  note: string;
  hasText: boolean;
  status: "pending" | "running" | "ready" | "failed";
  folder?: string;
  company?: string;
  title?: string;
  match?: number;
  open?: boolean | null;
  error?: string;
};

export async function listMyJobs(): Promise<MyJob[]> {
  const names = await fs.readdir(MINE_DIR).catch(() => [] as string[]);
  const out: MyJob[] = [];
  for (const n of names.filter((n) => n.endsWith(".json") && !n.endsWith(".result.json"))) {
    try { out.push(JSON.parse(await fs.readFile(path.join(MINE_DIR, n), "utf8"))); } catch {}
  }
  return out.sort((a, b) => b.created.localeCompare(a.created));
}

export async function readMyJob(id: string): Promise<MyJob | null> {
  if (!MINE_ID.test(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(MINE_DIR, `${id}.json`), "utf8")); } catch { return null; }
}

export async function saveMyJob(job: MyJob, text?: string) {
  await fs.mkdir(MINE_DIR, { recursive: true });
  if (text !== undefined) await fs.writeFile(path.join(MINE_DIR, `${job.id}.txt`), text, "utf8");
  const file = path.join(MINE_DIR, `${job.id}.json`);
  await fs.writeFile(file + ".tmp", JSON.stringify(job, null, 1), "utf8");
  await fs.rename(file + ".tmp", file);
}

/** Removes only the request files; prepared documents in Jobs/<date>/ stay. */
export async function deleteMyJob(id: string) {
  if (!MINE_ID.test(id)) return;
  for (const ext of [".json", ".txt", ".log", ".result.json"]) await fs.rm(path.join(MINE_DIR, id + ext), { force: true });
}
