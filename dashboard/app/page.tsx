import Link from "next/link";
import { HabitTile, QuickAddTodo, StudyRow, TodoRow } from "@/components/hub";
import { MatchFigure, Section, prettyDate } from "@/components/ui";
import { automationHealth } from "@/lib/health";
import { listDays, readTracker } from "@/lib/jobs";
import { learnToday } from "@/lib/learn";
import { listIssues, readIssue } from "@/lib/news";
import { habitSummary, readHabits, readStudy, studyToday } from "@/lib/routine";
import { localDate } from "@/lib/store";
import { bigThree, doneToday, readTodos, sortOpen } from "@/lib/todos";

export default async function Today() {
  const today = localDate();
  const [todos, habitData, study, jobs, days, issues, health, learn] = await Promise.all([
    readTodos(), readHabits(), readStudy(), readTracker(), listDays(), listIssues(), automationHealth(), learnToday(today),
  ]);
  const problems = health.filter((h) => h.state === "failed" || h.state === "missed");

  const big = bigThree(todos, today);
  const finished = doneToday(todos, today);
  const openCount = sortOpen(todos, today).length;
  const habits = habitSummary(habitData, today);
  const st = studyToday(study, today);

  const jobDay = days.find((d) => jobs.some((j) => j.date === d)) ?? null;
  const freshJobs = jobDay ? jobs.filter((j) => j.date === jobDay && j.status !== "REMOVED").sort((a, b) => b.match - a.match) : [];
  const toApply = jobs.filter((j) => j.status === "to apply").length;
  const issue = issues[0] ? await readIssue(issues[0]) : null;

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const progressParts = [habits.dueCount ? `${habits.doneCount}/${habits.dueCount} habits` : null, `${finished.length} ${finished.length === 1 ? "todo" : "todos"} done`].filter(Boolean);

  return (
    <>
      {problems.length > 0 && (
        <Link href="/system" className="panel alert" role="alert">
          <span className="dot bad" />
          <span>
            <b>{problems.map((p) => `${p.name} ${p.state === "missed" ? "missed its" : "failed at"} ${p.at} run`).join(" · ")}</b>
            <span className="muted"> · {problems.map((p) => p.detail).filter(Boolean).join(" · ")}. Open System for the log.</span>
          </span>
        </Link>
      )}
      <section style={{ marginBottom: 12 }}>
        <div className="eyebrow">{prettyDate(today)}</div>
        <h1 className="h1">{greet}.</h1>
        <p className="sub">{progressParts.join(" · ")}{freshJobs.length > 0 && <> · {freshJobs.length} new roles</>}{issue && <> · today’s AI brief is ready</>}</p>
      </section>

      <Section n="01" title="Focus" aside={<>Pinned or due today, then high priority.<br /><Link href="/todo">All {openCount} open todos</Link></>}>
        <div className="panel list">
          {big.length ? big.map((t) => <TodoRow key={t.id} todo={t} today={today} />) : (
            <div className="todo"><span className="muted">Nothing urgent. Add your most important task for today.</span></div>
          )}
        </div>
        <div style={{ marginTop: 12 }}><QuickAddTodo defaultDue={today} placeholder="What must happen today?" /></div>
      </Section>

      <Section n="02" title="Habits" aside={<>{habits.doneCount} of {habits.dueCount} done today<br /><Link href="/routine">Edit habits</Link></>}>
        <div className="progress" style={{ marginBottom: 14 }}><span style={{ width: `${habits.dueCount ? (habits.doneCount / habits.dueCount) * 100 : 0}%` }} /></div>
        <div className="habits">{habits.habits.map((h) => <HabitTile key={h.id} habit={h} />)}</div>
      </Section>

      <Section n="03" title="Study" aside={<>{Math.round(st.weekMinutes / 6) / 10} h studied in the last 7 days<br /><Link href="/routine#study">Open planner</Link></>}>
        <div className="today-grid">
          <div className="panel list">
            <div className="card-head" style={{ marginTop: 14, marginBottom: 4 }}><span className="eyebrow">Today’s sessions</span></div>
            {st.sessions.length ? st.sessions.map((s) => (
              <StudyRow key={s.id} kind="sessions" id={s.id} title={s.title} done={s.done} meta={<>{s.minutes} min{s.course && <> · {s.course}</>}</>} />
            )) : <div className="todo"><span className="muted">No sessions planned. <Link href="/routine#study" style={{ textDecoration: "underline" }}>Plan one</Link>.</span></div>}
          </div>
          <div className="panel">
            <div className="card-head"><span className="eyebrow">Next deadline</span></div>
            {st.upcoming[0] ? (
              <>
                <div className="kpi">{st.upcoming[0].daysLeft}<small>{st.upcoming[0].daysLeft === 1 ? "day left" : "days left"}</small></div>
                <p style={{ margin: "12px 0 0", fontWeight: 600 }}>{st.upcoming[0].title}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{prettyDate(st.upcoming[0].date)}{st.upcoming[0].course && <> · {st.upcoming[0].course}</>}</p>
              </>
            ) : <p className="muted" style={{ margin: 0 }}>No deadlines yet.</p>}
          </div>
        </div>
      </Section>

      <Section n="04" title="Learn" aside={<>{learn.daily.filter((d) => d.done).length} of {learn.daily.length} lessons studied<br /><Link href="/learn">Open Learn</Link></>}>
        <div className="today-grid">
          <div className="panel list">
            {learn.daily.map(({ track, lesson, done }) => (
              <Link key={track.id} href={`/learn/${track.id}`} className={`todo ${done ? "done" : ""}`}>
                <span className="check" data-on={done} aria-hidden>{done && <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="todo-title static">{lesson?.title ?? "Lesson not written yet"}</span>
                  <span className="todo-meta">{track.name}{lesson && <> · {lesson.minutes} min</>}</span>
                </span>
              </Link>
            ))}
            {!learn.daily.length && <div className="todo"><span className="muted">No daily tracks.</span></div>}
          </div>
          <div className="panel">
            <div className="card-head"><span className="eyebrow">Cards</span><Link href="/learn/review">{learn.due ? "Review" : "Deck"}</Link></div>
            <div className="kpi">{learn.due}<small>due today</small></div>
            <p className="muted" style={{ margin: "12px 0 0", fontSize: 13.5 }}>{learn.totalCards} cards in your deck · <Link href="/learn/lectures" style={{ textDecoration: "underline" }}>add a lecture transcript</Link></p>
          </div>
        </div>
      </Section>

      <Section n="05" title="Feeds" aside="Made overnight by your two AI agents">
        <div className="today-grid">
          <div className="panel">
            <div className="card-head">
              <span className="eyebrow">Job Radar · Claude</span>
              <Link href={jobDay ? `/jobs/day/${jobDay}` : "/jobs"}>Open</Link>
            </div>
            <div className="kpi">{toApply}<small>to apply</small></div>
            <div className="mini-list" style={{ marginTop: 14 }}>
              {freshJobs.slice(0, 3).map((j) => (
                <Link key={j.folder} href={`/jobs/job/${j.date}/${encodeURIComponent(j.folder)}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{j.title}</b><br /><span className="muted" style={{ fontSize: 13 }}>{j.company} · {j.location}</span></span>
                  <MatchFigure value={j.match} size={22} />
                </Link>
              ))}
              {!freshJobs.length && <span className="muted">No roles yet.</span>}
            </div>
          </div>
          <div className="panel">
            <div className="card-head">
              <span className="eyebrow">AI brief · ChatGPT</span>
              <Link href={issue ? `/news/${issue.date}` : "/news"}>{issue ? "Read" : "Set up"}</Link>
            </div>
            {issue ? (
              <>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{issue.headline}</p>
                <div className="mini-list" style={{ marginTop: 12 }}>
                  {issue.items.slice(0, 3).map((it, i) => <Link key={i} href={`/news/${issue.date}#item-${i + 1}`}>{it.title}</Link>)}
                </div>
              </>
            ) : <p className="muted" style={{ margin: 0 }}>No issue yet. ChatGPT writes it every morning at 07:30. See <Link href="/news" style={{ textDecoration: "underline" }}>News</Link>.</p>}
          </div>
        </div>
      </Section>
    </>
  );
}
