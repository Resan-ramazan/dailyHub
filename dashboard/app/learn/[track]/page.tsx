import Link from "next/link";
import { notFound } from "next/navigation";
import { RunNowButton } from "@/components/client";
import { FinishForm, Quiz, TrackSettings } from "@/components/learn";
import { CardPreview, LessonBlocks } from "@/components/lesson";
import { PageHead, Section, prettyDate } from "@/components/ui";
import { lessonDates, listLectures, readLesson, readMemory, readTrack } from "@/lib/learn";
import { localDate } from "@/lib/store";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrackPage({ params, searchParams }: { params: Promise<{ track: string }>; searchParams: Promise<{ date?: string }> }) {
  const [{ track: id }, sp] = await Promise.all([params, searchParams]);
  const track = await readTrack(id);
  if (!track) notFound();
  const today = localDate();
  const [memory, dates] = await Promise.all([readMemory(track.id), lessonDates(track.id)]);
  const memorySection = (n: string) => (
    <Section n={n} title="Memory" aside="What your mentor remembers. It goes into every prompt.">
      <div className="panel memory">
        {memory.level && <p className="memory-level"><span className="eyebrow">Where you are</span><br />{memory.level}</p>}
        {memory.next_hint && <p style={{ margin: "0 0 14px" }}><span className="eyebrow">Next up</span><br />{memory.next_hint}</p>}
        <div className="memory-cols">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Covered · {memory.covered.length}</div>
            <div className="chips">{memory.covered.slice(-30).reverse().map((c, i) => <span key={i} className="chip-s" title={c.date}>{c.topic}</span>)}</div>
            {!memory.covered.length && <span className="muted">Nothing yet.</span>}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Your feedback</div>
            <div className="mini-list">
              {memory.feedback.slice(-6).reverse().map((f, i) => (
                <div key={i}><b style={{ fontWeight: 600 }}>{prettyDate(f.date, { day: "numeric", month: "short" })}</b> · {f.difficulty}{f.note && <span className="muted"> · {f.note}</span>}</div>
              ))}
              {!memory.feedback.length && <span className="muted">No feedback yet.</span>}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );

  // ---------- Lecture course ----------
  if (track.kind === "lecture") {
    const lectures = await listLectures(track.id);
    return (
      <>
        <PageHead eyebrow="Learn · Lecture course" title={track.name} sub="Paste the live transcript after each lecture. ChatGPT re-teaches it from zero, with a quiz and flashcards.">
          <Link className="btn primary" href={`/learn/lectures?track=${track.id}`}>+ Paste transcript</Link>
        </PageHead>
        <Section n="01" title="Lecture notes" aside={`${lectures.length} so far`}>
          <div className="panel list">
            {lectures.map((l) => (
              <Link key={l.id} href={`/learn/lectures/${l.id}`} className="todo" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>{l.title || "Untitled lecture"}</span>
                <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{prettyDate(l.date, { day: "numeric", month: "short" })} · {l.status}</span>
              </Link>
            ))}
            {!lectures.length && <div className="todo"><span className="muted">No lectures yet.</span></div>}
          </div>
        </Section>
        {memorySection("02")}
        <Section n="03" title="Instructions" aside="How ChatGPT should teach this course"><TrackSettings track={track} /></Section>
      </>
    );
  }

  // ---------- Daily track ----------
  const day = sp.date && DATE_RE.test(sp.date) ? sp.date : today;
  const lesson = await readLesson(day, track.id);
  const fb = memory.feedback.find((f) => f.date === day && !f.ref) ?? null;

  return (
    <>
      <PageHead eyebrow={`${track.name} · ${prettyDate(day)}`} title={lesson?.title ?? "No lesson yet"} sub={lesson?.summary}>
        <div className="chips">
          {dates.slice(0, 7).map((d) => (
            <Link key={d} href={d === today ? `/learn/${track.id}` : `/learn/${track.id}?date=${d}`} className="chip" data-active={d === day}>
              {d === today ? "Today" : prettyDate(d, { day: "numeric", month: "short" })}
            </Link>
          ))}
        </div>
      </PageHead>

      {lesson ? (
        <>
          {lesson.progress && (
            <div className="panel progress-note"><span className="eyebrow">Where you are</span><p>{lesson.progress}</p><span className="chip-s">{lesson.minutes} min</span></div>
          )}
          <Section n="01" title="Lesson" aside={<>{lesson.blocks.length} parts<br />{lesson.blocks.map((b, i) => <a key={i} href={`#part-${i + 1}`} style={{ display: "block" }}>{b.title}</a>)}</>}>
            <LessonBlocks blocks={lesson.blocks} />
          </Section>
          {lesson.cards.length > 0 && (
            <Section n="02" title="New cards" aside={<>{lesson.cards.length} added to your deck<br /><Link href="/learn/review">Review cards</Link></>}>
              <CardPreview cards={lesson.cards} />
            </Section>
          )}
          {lesson.quiz.length > 0 && (
            <Section n="03" title="Quiz" aside="Check yourself before you finish">
              <div className="panel"><Quiz items={lesson.quiz} /></div>
            </Section>
          )}
          <Section n="04" title="Done?" aside={lesson.next_hint ? <>Next time: {lesson.next_hint}</> : "Tell your mentor how it went"}>
            <FinishForm key={day} trackId={track.id} date={day} title={lesson.title} minutes={track.minutes} previous={fb} />
          </Section>
        </>
      ) : (
        <div className="panel empty">
          <p style={{ marginTop: 0 }}>{day === today ? "Today’s lesson has not been written yet. It runs every morning at 07:00." : "No lesson on this day."}</p>
          {day === today && <div style={{ display: "flex", justifyContent: "center" }}><RunNowButton kind="learn" label="Write it now" confirmText="Ask ChatGPT to write today’s missing lessons now? It takes a few minutes." /></div>}
        </div>
      )}

      {memorySection("05")}
      <Section n="06" title="Instructions" aside="Your ChatGPT project instructions. Edit them any time."><TrackSettings track={track} /></Section>
    </>
  );
}
