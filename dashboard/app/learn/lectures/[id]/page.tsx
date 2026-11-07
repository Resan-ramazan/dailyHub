import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/components/Markdown";
import { AutoRefresh, FinishForm, LectureActions, Quiz } from "@/components/learn";
import { CardPreview } from "@/components/lesson";
import { PageHead, Section, prettyDate } from "@/components/ui";
import { readLecture, readMemory, readTrack } from "@/lib/learn";

export default async function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecture = await readLecture(id);
  if (!lecture) notFound();
  const { meta, note } = lecture;
  const track = await readTrack(meta.trackId);
  const memory = await readMemory(meta.trackId);
  const fb = memory.feedback.find((f) => f.ref === meta.id) ?? null;
  const working = meta.status === "pending" || meta.status === "running";

  return (
    <>
      <PageHead
        eyebrow={`${track?.name ?? meta.trackId} · ${prettyDate(meta.date)}`}
        title={note?.title ?? meta.title ?? "Lecture"}
        sub={note?.tldr ?? `${meta.chars.toLocaleString("en-GB")} characters of transcript`}
      >
        <LectureActions id={meta.id} canRetry={!working} />
      </PageHead>

      {working && (
        <div className="panel writing">
          <AutoRefresh />
          <span className="dot live" />
          <div>
            <b>ChatGPT is re-teaching this lecture…</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>Usually 2–6 minutes. This page refreshes by itself and you get a notification when it is ready.</p>
          </div>
        </div>
      )}
      {meta.status === "failed" && (
        <div className="panel alert" style={{ margin: "0 0 28px" }}>
          <span className="dot bad" />
          <span><b>Could not write the note.</b> <span className="muted">{meta.error ?? "Unknown error"}. Try “Regenerate”; the log is in Lessons/logs/lecture-{meta.id}.log.</span></span>
        </div>
      )}

      {note && (
        <>
          <Section n="01" title="Re-taught" aside={<>{note.sections.length} parts<br />{note.sections.map((s, i) => <a key={i} href={`#sec-${i + 1}`} style={{ display: "block" }}>{s.title}</a>)}</>}>
            <div className="lesson-blocks">
              {note.sections.map((s, i) => (
                <article className="panel lesson-block" key={i} id={`sec-${i + 1}`}>
                  <header className="lesson-block-head">
                    <span className="lesson-kind">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="lesson-block-title">{s.title}</h3>
                  </header>
                  <Markdown>{s.body}</Markdown>
                </article>
              ))}
            </div>
          </Section>

          {note.key_terms.length > 0 && (
            <Section n="02" title="Key terms" aside={`${note.key_terms.length} terms`}>
              <div className="panel">
                <dl className="terms">
                  {note.key_terms.map((k, i) => <div key={i}><dt>{k.term}</dt><dd>{k.meaning}</dd></div>)}
                </dl>
              </div>
            </Section>
          )}

          {note.exam_focus && (
            <Section n="03" title="Exam focus" aside="What is most likely to be asked">
              <div className="panel exam"><Markdown>{note.exam_focus}</Markdown></div>
            </Section>
          )}

          {note.quiz.length > 0 && (
            <Section n="04" title="Quiz" aside="Check what stuck">
              <div className="panel"><Quiz items={note.quiz} /></div>
            </Section>
          )}

          {note.cards.length > 0 && (
            <Section n="05" title="Cards" aside={<>{note.cards.length} added to your deck<br /><Link href="/learn/review">Review cards</Link></>}>
              <CardPreview cards={note.cards} />
            </Section>
          )}

          {note.open_questions.length > 0 && (
            <Section n="06" title="Ask the lecturer" aside="Parts the transcript left unclear">
              <div className="panel"><ul className="md" style={{ margin: 0, paddingLeft: 20 }}>{note.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
            </Section>
          )}

          {track && (
            <Section n="07" title="Done?" aside="Logged as a study session in Routine">
              <FinishForm trackId={track.id} date={meta.date} title={note.title} minutes={track.minutes} refId={meta.id} previous={fb} />
            </Section>
          )}
        </>
      )}
    </>
  );
}
