import Link from "next/link";
import { LectureForm } from "@/components/learn";
import { PageHead, Section, prettyDate } from "@/components/ui";
import { listLectures, readTracks } from "@/lib/learn";
import { localDate } from "@/lib/store";

export default async function LecturesPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const sp = await searchParams;
  const [tracks, lectures] = await Promise.all([readTracks(), listLectures()]);
  const courses = tracks.filter((t) => t.kind === "lecture" && t.active);
  const name = (id: string) => tracks.find((t) => t.id === id)?.name ?? id;

  return (
    <>
      <PageHead eyebrow="Learn · Lectures" title="Explain a lecture" sub="Paste the live transcript of a lecture. ChatGPT re-teaches it from zero (intuition, definitions, worked examples), then adds a quiz and flashcards. Takes a few minutes; you get a notification." />
      {courses.length ? (
        <LectureForm tracks={courses.map((t) => ({ id: t.id, name: t.name }))} today={localDate()} defaultTrack={courses.some((t) => t.id === sp.track) ? sp.track : undefined} />
      ) : <div className="panel empty">No active lecture course. Activate one under its Instructions.</div>}

      <Section n="01" title="Lecture notes" aside={`${lectures.length} so far`}>
        <div className="panel list">
          {lectures.map((l) => (
            <Link key={l.id} href={`/learn/lectures/${l.id}`} className="todo" style={{ justifyContent: "space-between" }}>
              <span style={{ minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{l.title || "Untitled lecture"}</b><br />
                <span className="muted" style={{ fontSize: 13 }}>{name(l.trackId)} · {prettyDate(l.date, { day: "numeric", month: "short" })}</span>
              </span>
              <span className={`learn-state ${l.status === "ready" ? "on" : ""}`}>{{ ready: "Ready", failed: "Failed", running: "Writing…", pending: "Queued" }[l.status]}</span>
            </Link>
          ))}
          {!lectures.length && <div className="todo"><span className="muted">No lectures yet.</span></div>}
        </div>
      </Section>
    </>
  );
}
