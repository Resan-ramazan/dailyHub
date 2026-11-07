import "server-only";
import path from "node:path";
import { readSchedule } from "./jobs";
import { readLearnSchedule } from "./learn";
import { readNewsSchedule } from "./news";
import { ROOT, lastRunSummary, localDate, readRunLogs } from "./store";

export type Health = {
  name: string;
  /** ok: succeeded today · running · failed: last run today failed · missed: due but never started · pending: not due yet · off: not scheduled */
  state: "ok" | "running" | "failed" | "missed" | "pending" | "off";
  at: string;
  detail?: string;
};

const GRACE_MIN = 20; // launchd + catch-up get this long before a run counts as missed

async function check(name: string, logDir: string, sched: { hour: number; minute: number; installed: boolean }): Promise<Health> {
  const at = `${String(sched.hour).padStart(2, "0")}:${String(sched.minute).padStart(2, "0")}`;
  if (!sched.installed) return { name, state: "off", at };
  const logs = await readRunLogs(logDir, 400);
  const todayLog = logs.latestName === `${localDate()}.log` ? logs.latest : "";
  const run = lastRunSummary(todayLog);
  if (/end \(exit 0\)/.test(todayLog)) return { name, state: "ok", at, detail: run.end };
  if (run.state === "running") return { name, state: "running", at, detail: run.start };
  if (run.state === "failed") {
    const tries = (todayLog.match(/ start ===/g) ?? []).length;
    return { name, state: "failed", at, detail: tries >= 2 ? "failed twice today; catch-up stopped" : "failed once; catch-up will retry" };
  }
  const now = new Date();
  const due = new Date(now);
  due.setHours(sched.hour, sched.minute + GRACE_MIN, 0, 0);
  return now >= due ? { name, state: "missed", at, detail: "not started yet" } : { name, state: "pending", at };
}

export async function automationHealth(): Promise<Health[]> {
  const [jobs, news, learn] = await Promise.all([readSchedule(), readNewsSchedule(), readLearnSchedule()]);
  return Promise.all([
    check("Lessons", path.join(ROOT, "Lessons", "logs"), learn),
    check("AI brief", path.join(ROOT, "News", "logs"), news),
    check("Job scan", path.join(ROOT, "Jobs", "logs"), jobs),
  ]);
}
