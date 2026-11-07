import type { Block } from "@/lib/learn";
import Markdown from "./Markdown";

const KIND_LABEL: Record<string, string> = {
  explanation: "Explanation", grammar: "Grammar", vocab: "Vocabulary", listening: "Listening", reading: "Reading",
  task: "Task", exercise: "Exercise", resource: "Resource", project: "Project",
};

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** Lesson parts as numbered panels; listening/reading/resources get a prominent link. */
export function LessonBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="lesson-blocks">
      {blocks.map((b, i) => (
        <article className="panel lesson-block" data-kind={b.kind} key={i} id={`part-${i + 1}`}>
          <header className="lesson-block-head">
            <span className="lesson-kind">{String(i + 1).padStart(2, "0")} · {KIND_LABEL[b.kind] ?? b.kind}</span>
            <h3 className="lesson-block-title">{b.title}</h3>
          </header>
          {b.url && (
            <a className="lesson-link" href={b.url} target="_blank" rel="noreferrer">
              <span>{host(b.url)}</span><span aria-hidden>↗</span>
            </a>
          )}
          <Markdown>{b.body}</Markdown>
        </article>
      ))}
    </div>
  );
}

export function CardPreview({ cards }: { cards: { front: string; back: string; example: string }[] }) {
  if (!cards.length) return null;
  return (
    <div className="card-grid">
      {cards.map((c, i) => (
        <div className="card-mini" key={i}>
          <b>{c.front}</b>
          <span>{c.back}</span>
          {c.example && <i>{c.example}</i>}
        </div>
      ))}
    </div>
  );
}
