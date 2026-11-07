import Link from "next/link";
import { RunNowButton } from "@/components/client";
import { PageHead, Section, prettyDate } from "@/components/ui";
import { learnToday } from "@/lib/learn";
import { localDate } from "@/lib/store";

export default async function LearnPage() {
  const today = localDate();
  const { tracks, daily, due, totalCards, lectures } = await learnToday(today);
  const lectureTracks = tracks.filter((t) => t.kind === "lecture" && t.active);
  const missing = daily.filter((d) => !d.lesson).length;
  const doneCount = daily.filter((d) => d.done).length;

  return (
    <>
      <PageHead
        eyebrow={`Learn · ${prettyDate(today)}`}
        title="Today’s lessons"
        sub="Your ChatGPT study projects in one place. ChatGPT writes a fresh lesson every morning at 07:00, remembers what you covered and adapts to your feedback."
      >
        <Link className={`btn ${due ? "primary" : ""}`} href="/learn/review">{due ? `Review ${due} cards` : "Cards"}</Link>
        <Link className="btn" href="/learn/lectures">+ Lecture transcript</Link>
      </PageHead>

      <Section n="01" title="Daily" aside={<>{doneCount} of {daily.length} studied today{missing > 0 && <><br />{missing} not written yet</>}</>}>
        <div className="learn-tiles">
          {daily.map(({ track, lesson, done, level }, i) => (
            <Link key={track.id} href={`/learn/${track.id}`} className="panel learn-tile fade-in" data-done={done} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="learn-tile-top">
                <span className="eyebrow">{track.name}</span>
                <span className={`learn-state ${done ? "on" : ""}`}>{done ? "✓ Studied" : lesson ? `${lesson.minutes} min` : "Not written yet"}</span>
              </div>
              {lesson ? (
                <>
                  <h3 className="learn-tile-title">{lesson.title}</h3>
                  <p className="learn-tile-sum">{lesson.summary}</p>
                  <div className="learn-tile-foot">
                    {lesson.blocks.slice(0, 6).map((b, k) => <span key={k} className="chip-s">{b.kind}</span>)}
                    {lesson.quiz.length > 0 && <span className="chip-s">{lesson.quiz.length} quiz</span>}
                  </div>
                </>
              ) : (
                <p className="learn-tile-sum muted">{level || "The first lesson is written at the next run."}</p>
              )}
            </Link>
          ))}
        </div>
        {missing > 0 && (
          <div style={{ marginTop: 14 }}>
            <RunNowButton kind="learn" label="Write today’s lessons now" confirmText="Ask ChatGPT to write today’s missing lessons now? It takes a few minutes." />
          </div>
        )}
      </Section>

      <Section n="02" title="Lectures" aside={<>Paste a live transcript, get the lecture re-taught from zero with a quiz.<br /><Link href="/learn/lectures">All lecture notes</Link></>}>
        <div className="learn-tiles">
          {lectureTracks.map((t) => {
            const mine = lectures.filter((l) => l.trackId === t.id);
            return (
              <div key={t.id} className="panel learn-tile">
                <div className="learn-tile-top">
                  <Link href={`/learn/${t.id}`} className="eyebrow">{t.name}</Link>
                  <span className="learn-state">{mine.length} {mine.length === 1 ? "note" : "notes"}</span>
                </div>
                <div className="mini-list">
                  {mine.slice(0, 3).map((l) => (
                    <Link key={l.id} href={`/learn/lectures/${l.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{l.title || "Untitled lecture"}</span>
                      <span className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>{l.status === "ready" ? prettyDate(l.date, { day: "numeric", month: "short" }) : l.status === "failed" ? "failed" : "writing…"}</span>
                    </Link>
                  ))}
                  {!mine.length && <span className="muted">No lectures yet.</span>}
                </div>
                <Link className="btn sm" href={`/learn/lectures?track=${t.id}`} style={{ alignSelf: "flex-start", marginTop: "auto" }}>+ Paste transcript</Link>
              </div>
            );
          })}
        </div>
      </Section>

      <Section n="03" title="Cards" aside="Spaced repetition: known cards come back after 1, 2, 4, 8, 16 then 32 days.">
        <div className="panel stats">
          <div className={`stat ${due ? "hot" : ""}`}><div className="stat-label">Due today</div><div className="stat-value">{due}</div></div>
          <div className="stat"><div className="stat-label">In your deck</div><div className="stat-value">{totalCards}</div></div>
          <div className="stat" style={{ justifyContent: "center" }}>
            <Link className={`btn ${due ? "primary" : ""}`} href="/learn/review">{due ? "Start review" : "Browse cards"}</Link>
          </div>
        </div>
      </Section>
    </>
  );
}
