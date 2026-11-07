"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { runNow } from "@/app/actions";

function nextRun(hour: number, minute: number, now: Date) {
  const t = new Date(now);
  t.setHours(hour, minute, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

export function Countdown({ hour, minute, small }: { hour: number; minute: number; small?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const cls = `countdown${small ? " sm" : ""}`;
  if (!now) return <span className={cls}>--:--:--</span>;
  const ms = nextRun(hour, minute, now).getTime() - now.getTime();
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className={cls}>{pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</span>;
}

export function NavLinks() {
  const p = usePathname();
  const links = [
    { href: "/", label: "Today", active: p === "/" },
    { href: "/jobs", label: "Jobs", active: p.startsWith("/jobs") },
    { href: "/news", label: "News", active: p.startsWith("/news") },
    { href: "/learn", label: "Learn", active: p.startsWith("/learn") },
    { href: "/todo", label: "Todo", active: p.startsWith("/todo") },
    { href: "/routine", label: "Routine", active: p.startsWith("/routine") },
    { href: "/system", label: "System", active: p.startsWith("/system") },
  ];
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.label} href={l.href} data-active={l.active}>{l.label}</Link>
      ))}
    </nav>
  );
}

/** Sub-navigation inside the Jobs module. */
export function JobsSubnav({ latestDay }: { latestDay: string | null }) {
  const p = usePathname();
  const links = [
    { href: "/jobs", label: "Overview", active: p === "/jobs" },
    { href: "/jobs/pipeline", label: "Pipeline", active: p.startsWith("/jobs/pipeline") },
    { href: "/jobs/mine", label: "My jobs", active: p.startsWith("/jobs/mine") },
    { href: latestDay ? `/jobs/day/${latestDay}` : "/jobs", label: "Reports", active: p.startsWith("/jobs/day") || p.startsWith("/jobs/job") },
  ];
  return (
    <nav className="subnav" aria-label="Job Radar">
      {links.map((l) => <Link key={l.label} href={l.href} className="chip" data-active={l.active}>{l.label}</Link>)}
    </nav>
  );
}

/** Countdown to whichever scheduled run comes next. */
export function NextRun({ runs }: { runs: { label: string; hour: number; minute: number }[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now || !runs.length) return null;
  const next = runs.map((r) => ({ ...r, at: nextRun(r.hour, r.minute, now) })).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const s = Math.floor((next.at.getTime() - now.getTime()) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="clock">{next.label} in <b>{pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</b></span>;
}

export function RunNowButton({ kind = "jobs", label = "Run search now", confirmText = "Start a full job-search run now? It takes several minutes and uses Claude." }: { kind?: "jobs" | "news" | "learn"; label?: string; confirmText?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        className="btn primary"
        disabled={pending}
        onClick={() => {
          if (!confirm(confirmText)) return;
          start(async () => {
            const r = await runNow(kind);
            setMsg(`Run started (pid ${r.pid ?? "?"}). The log below refreshes on reload.`);
            router.refresh();
          });
        }}
      >
        ▶ {label}
      </button>
      {msg && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

export function DocViewer({ docs }: { docs: { label: string; href: string; download?: string }[] }) {
  const [i, setI] = useState(0);
  if (!docs.length) return <div className="empty">No documents in this folder.</div>;
  const d = docs[i];
  return (
    <div>
      <div className="tabs" role="tablist">
        {docs.map((x, k) => (
          <button key={x.href} role="tab" className="tab" aria-selected={k === i} onClick={() => setI(k)}>{x.label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <a className="btn sm" href={d.href} target="_blank" rel="noreferrer">Open ↗</a>
        {d.download && <a className="btn sm" href={d.download}>Download</a>}
      </div>
      <iframe key={d.href} className="doc-frame" src={d.href} title={d.label} />
    </div>
  );
}

/** Day/night switch. The initial theme is set before paint by the inline script in layout.tsx. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  };
  const dark = theme === "dark";
  return (
    <button className="theme-btn" onClick={flip} aria-label={dark ? "Switch to day theme" : "Switch to night theme"}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
      {theme == null ? "Theme" : dark ? "Night" : "Day"}
    </button>
  );
}
