import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT, lastRunSummary, readAgentSchedule, readJson, readRunLogs, safePath } from "./store";

export const NEWS_DIR = path.join(ROOT, "News");
const LOG_DIR = path.join(NEWS_DIR, "logs");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NewsItem = { title: string; summary: string; why?: string; url?: string; source?: string; tag?: string; details?: { label: string; text: string }[] };
export type Issue = {
  date: string;
  headline: string;
  intro?: string;
  items: NewsItem[];
  sections?: { title: string; body: string }[];
  for_you?: string;
  model?: string;
  generatedAt?: string;
};

export async function listIssues(): Promise<string[]> {
  const entries = await fs.readdir(NEWS_DIR, { withFileTypes: true }).catch(() => []);
  const days = entries.filter((e) => e.isDirectory() && DATE_RE.test(e.name)).map((e) => e.name).sort().reverse();
  const out: string[] = [];
  for (const d of days) {
    try { await fs.access(path.join(NEWS_DIR, d, "issue.json")); out.push(d); } catch {}
  }
  return out;
}

export async function readIssue(date: string): Promise<Issue | null> {
  if (!DATE_RE.test(date)) return null;
  const issue = await readJson<Issue | null>(safePath(NEWS_DIR, date, "issue.json"), null).catch(() => null);
  if (!issue || !Array.isArray(issue.items)) return null;
  // Only keep http(s) links; the model's output is not trusted blindly.
  issue.items = issue.items.map((it) => ({ ...it, url: it.url && /^https?:\/\//i.test(it.url) ? it.url : undefined }));
  return issue;
}

export const readNewsSchedule = () => readAgentSchedule("com.dailyhub.newsletter", { hour: 7, minute: 30 });

export async function readNewsLogs() {
  const logs = await readRunLogs(LOG_DIR);
  return { ...logs, run: lastRunSummary(logs.latest) };
}

/** Is the Codex CLI (bundled with the ChatGPT app) present and signed in with a ChatGPT account? Never returns tokens. */
export async function chatgptLogin() {
  const bin = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
  const found = await fs.access(bin).then(() => true, () => false);
  let mode: string | null = null;
  try {
    mode = (JSON.parse(await fs.readFile(path.join(os.homedir(), ".codex", "auth.json"), "utf8")) as { auth_mode?: string }).auth_mode ?? null;
  } catch {}
  return { found, signedIn: mode === "chatgpt" };
}
