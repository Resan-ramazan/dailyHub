import { RunNowButton } from "@/components/client";
import { PageHead, Section } from "@/components/ui";
import { lastRunSummary, readLogs, readSchedule } from "@/lib/jobs";
import { readLearnLogs, readLearnSchedule } from "@/lib/learn";
import { chatgptLogin, readNewsLogs, readNewsSchedule } from "@/lib/news";
import type { RunState } from "@/lib/store";

function Log({ text }: { text: string }) {
  return (
    <pre className="panel term">
      {text.split("\n").map((l, i) => (
        <div key={i} className={/^===/.test(l) ? "hl" : /error|fail|denied|blocked|can't/i.test(l) ? "err" : undefined}>{l || " "}</div>
      ))}
    </pre>
  );
}

const hhmm = (s: { hour: number; minute: number }) => `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;

function Status({ run, schedule, installed, extra }: { run: RunState; schedule: string; installed: boolean; extra?: React.ReactNode }) {
  return (
    <div className="panel stats" style={{ marginBottom: 14 }}>
      <div className="stat">
        <div className="stat-label">Schedule</div>
        <div className="stat-value" style={{ fontSize: 40 }}>{schedule}</div>
        <div className="muted" style={{ fontSize: 13 }}>{installed ? "Installed LaunchAgent" : "Not installed yet"}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Last run</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
          <span className={`dot ${run.state === "running" ? "live" : run.state === "failed" ? "bad" : run.state === "none" ? "warn" : ""}`} />
          {{ ok: "Completed", failed: "Failed", running: "Running…", none: "No runs yet" }[run.state]}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{run.end ?? run.start ?? "—"}</div>
      </div>
      {extra}
    </div>
  );
}

export default async function System() {
  const [jobSched, jobLogs, newsSched, newsLogs, login, learnSched, learnLogs] = await Promise.all([readSchedule(), readLogs(), readNewsSchedule(), readNewsLogs(), chatgptLogin(), readLearnSchedule(), readLearnLogs()]);
  const learnInstall = "! cp ~/DailyHub/automation/com.dailyhub.learn.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dailyhub.learn.plist";
  const jobRun = lastRunSummary(jobLogs.latest);
  const installCmd = "! cp ~/DailyHub/automation/com.dailyhub.newsletter.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dailyhub.newsletter.plist";

  return (
    <>
      <PageHead eyebrow="System" title="Automations" sub="Three agents run every morning on this Mac: Claude finds jobs, ChatGPT writes your AI brief and your lessons." />

      <Section n="01" title="Job scan" aside={<>Claude · automation/run_daily.sh<br />{jobLogs.latestName && `Jobs/logs/${jobLogs.latestName}`}</>}>
        <Status run={jobRun} schedule={hhmm(jobSched)} installed={jobSched.installed} />
        <div style={{ marginBottom: 14 }}><RunNowButton kind="jobs" label="Run job scan now" /></div>
        {jobLogs.latest ? <Log text={jobLogs.latest} /> : <div className="panel empty">No run log yet.</div>}
        {jobLogs.launchdErr && <div style={{ marginTop: 14 }}><div className="eyebrow" style={{ marginBottom: 8 }}>launchd errors</div><Log text={jobLogs.launchdErr} /></div>}
      </Section>

      <Section n="02" title="AI newsletter" aside={<>ChatGPT (Codex) · newsletter/run_daily.sh<br />{newsLogs.latestName && `News/logs/${newsLogs.latestName}`}</>}>
        <Status
          run={newsLogs.run} schedule={hhmm(newsSched)} installed={newsSched.installed}
          extra={
            <div className="stat">
              <div className="stat-label">ChatGPT login</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700 }}>
                <span className={`dot ${login.found && login.signedIn ? "" : "bad"}`} />
                {!login.found ? "Codex not found" : login.signedIn ? "Signed in" : "Not signed in"}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>Uses your ChatGPT plan, no API credits</div>
            </div>
          }
        />
        <div style={{ marginBottom: 14 }}>
          <RunNowButton kind="news" label="Run newsletter now" confirmText="Write today’s AI brief now? ChatGPT (via Codex) searches GitHub; it takes a few minutes and uses your ChatGPT plan." />
        </div>
        {!newsSched.installed && (
          <div className="panel md" style={{ marginBottom: 14 }}>
            <p style={{ marginTop: 0 }}><b>Turn on the 07:30 schedule:</b> paste this into the Claude Code prompt (or run it without the leading <code>!</code> in Terminal):</p>
            <pre className="term" style={{ padding: 14, margin: 0 }}>{installCmd}</pre>
          </div>
        )}
        {newsLogs.latest ? <Log text={newsLogs.latest} /> : <div className="panel empty">No newsletter run yet.</div>}
      </Section>

      <Section n="03" title="Learn lessons" aside={<>ChatGPT (Codex) · learn/run_daily.sh<br />{learnLogs.latestName && `Lessons/logs/${learnLogs.latestName}`}</>}>
        <Status run={learnLogs.run} schedule={hhmm(learnSched)} installed={learnSched.installed} />
        <div style={{ marginBottom: 14 }}>
          <RunNowButton kind="learn" label="Write today’s lessons now" confirmText="Ask ChatGPT to write today’s missing lessons now? It takes a few minutes and uses your ChatGPT plan." />
        </div>
        {!learnSched.installed && (
          <div className="panel md" style={{ marginBottom: 14 }}>
            <p style={{ marginTop: 0 }}><b>Turn on the 07:00 schedule:</b> paste this into the Claude Code prompt (or run it without the leading <code>!</code> in Terminal):</p>
            <pre className="term" style={{ padding: 14, margin: 0 }}>{learnInstall}</pre>
          </div>
        )}
        {learnLogs.latest ? <Log text={learnLogs.latest} /> : <div className="panel empty">No lesson run yet.</div>}
      </Section>
    </>
  );
}
