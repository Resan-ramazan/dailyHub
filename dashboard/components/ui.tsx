import Link from "next/link";
import type { TrackedJob } from "@/lib/jobs";
import StatusSelect from "./StatusSelect";

/** Swiss rule: one accent. Red marks the strongest matches, everything else is ink. */
export function matchColor(m: number) {
  return m >= 85 ? "var(--accent)" : "var(--ink)";
}

/** Days between a YYYY-MM-DD date and today (local time). */
function daysAgo(iso: string) {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((today - Date.UTC(y, m - 1, d)) / 86_400_000);
}

/** When a job was found: a "New today" badge, then "Yesterday", "3 days ago", or a short date after a week. */
export function FoundWhen({ date }: { date: string }) {
  const n = daysAgo(date);
  if (n <= 0) return <span className="new-badge" title={date}>New today</span>;
  const label = n === 1 ? "Yesterday" : n < 7 ? `${n} days ago` : prettyDate(date, { day: "numeric", month: "short" });
  return <span title={date}>{label}</span>;
}

export function MatchFigure({ value, size = 44 }: { value: number; size?: number }) {
  const color = matchColor(value);
  return (
    <div className="fig" style={{ color, width: size * 1.6 }} aria-label={`Match ${value}%`}>
      <div className="fig-num" style={{ fontSize: size }}>{value}<small>%</small></div>
      <div className="fig-line"><span style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export const statusClass = (s: string) => "s-" + s.toLowerCase().replace(/\s+/g, "-");

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${statusClass(status)}`}>{status[0].toUpperCase() + status.slice(1).toLowerCase()}</span>;
}

export function MatchBar({ value }: { value: number | null }) {
  if (value == null) return <span className="pill s-removed">Removed</span>;
  return (
    <div className="bar" style={{ color: matchColor(value) }}>
      <span style={{ width: 38 }}>{value}%</span>
      <div className="fig-line"><span style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function JobCard({ job, delay = 0 }: { job: TrackedJob; delay?: number }) {
  const href = `/jobs/job/${job.date}/${encodeURIComponent(job.folder)}`;
  return (
    <article className={`panel job-card fade-in ${job.status === "REMOVED" ? "removed" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="job-top">
        <div style={{ minWidth: 0 }}>
          <div className="job-rank"><b>{job.rank === 0 ? "Mine" : String(job.rank).padStart(2, "0")}</b> · {job.company}</div>
          <Link href={href}><h3 className="job-title">{job.title}</h3></Link>
        </div>
        <MatchFigure value={job.match} />
      </div>
      <div className="job-meta"><span>{job.location}</span><FoundWhen date={job.date} /></div>
      <div className="job-foot">
        <StatusSelect date={job.date} folder={job.folder} status={job.status} />
        <Link className="btn sm" href={href}>Open</Link>
      </div>
    </article>
  );
}

export function Stat({ label, value, suffix, hot }: { label: string; value: string | number; suffix?: string; hot?: boolean }) {
  return (
    <div className={`stat ${hot ? "hot" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}{suffix && <small>{suffix}</small>}</div>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, children }: { eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="h1">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>}
    </header>
  );
}

/** Swiss section: number + title in a narrow left column, content on the right. */
export function Section({ n, title, aside, children }: { n: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-label">
        <span className="section-num">{n}</span>
        <h2 className="h2">{title}</h2>
        {aside && <div className="aside">{aside}</div>}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

export function prettyDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", opts);
}
