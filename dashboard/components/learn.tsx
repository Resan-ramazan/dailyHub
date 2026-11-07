"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { finishLesson, removeCard, removeLecture, retryLecture, reviewCard, saveTrack, submitLecture } from "@/app/actions";

type QuizItem = { q: string; options: string[]; answer: number; why: string };

// ---------- Quiz ----------
export function Quiz({ items }: { items: QuizItem[] }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => items.map(() => null));
  const answered = picked.filter((p) => p !== null).length;
  const score = picked.filter((p, i) => p === items[i].answer).length;
  if (!items.length) return null;
  return (
    <div className="quiz">
      {items.map((q, i) => {
        const p = picked[i];
        return (
          <div className="quiz-q" key={i}>
            <div className="quiz-text"><span className="quiz-n">{i + 1}</span>{q.q}</div>
            <div className="quiz-options">
              {q.options.map((o, k) => {
                const state = p === null ? undefined : k === q.answer ? "right" : k === p ? "wrong" : "dim";
                return (
                  <button
                    type="button" key={k} className="quiz-opt" data-state={state} disabled={p !== null}
                    onClick={() => setPicked((cur) => cur.map((x, j) => (j === i ? k : x)))}
                  >
                    <span className="quiz-letter">{String.fromCharCode(65 + k)}</span>{o}
                  </button>
                );
              })}
            </div>
            {p !== null && <div className="quiz-why" data-ok={p === q.answer}>{p === q.answer ? "Right. " : "Not quite. "}{q.why}</div>}
          </div>
        );
      })}
      <div className="quiz-foot">
        <span><b>{score}</b> / {items.length} correct{answered < items.length && <span className="muted"> · {items.length - answered} left</span>}</span>
        {answered > 0 && <button type="button" className="btn sm" onClick={() => setPicked(items.map(() => null))}>Retry</button>}
      </div>
    </div>
  );
}

// ---------- Finish + feedback (feeds the mentor's memory) ----------
const LEVELS = [
  { v: "easy", label: "Easy", hint: "Speed up" },
  { v: "ok", label: "Just right", hint: "Keep the pace" },
  { v: "hard", label: "Hard", hint: "Review this again" },
] as const;

export function FinishForm({ trackId, date, title, minutes, refId, previous }: {
  trackId: string; date: string; title: string; minutes: number; refId?: string;
  previous?: { difficulty: string; note: string; minutes?: number } | null;
}) {
  const [pending, start] = useTransition();
  const [difficulty, setDifficulty] = useState(previous?.difficulty ?? "ok");
  const [editing, setEditing] = useState(!previous);
  const [error, setError] = useState<string | null>(null);

  if (!editing && previous) {
    return (
      <div className="finish done">
        <span className="finish-check">✓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Studied</b> · {LEVELS.find((l) => l.v === previous.difficulty)?.label ?? previous.difficulty} · {previous.minutes ?? minutes} min
          {previous.note && <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>“{previous.note}”</div>}
        </div>
        <button type="button" className="btn sm" onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }
  return (
    <form
      className="finish"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await finishLesson(trackId, { date, difficulty, note: String(v.get("note") ?? ""), minutes: Number(v.get("minutes")), ref: refId, title });
            setEditing(false);
          } catch { setError("Could not save. Try again."); }
        });
      }}
    >
      <div className="finish-row">
        <span className="finish-label">How was it?</span>
        <div className="seg" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((l) => (
            <button type="button" key={l.v} role="radio" aria-checked={difficulty === l.v} data-on={difficulty === l.v} onClick={() => setDifficulty(l.v)} title={l.hint}>{l.label}</button>
          ))}
        </div>
        <label className="finish-min">
          <input className="input" type="number" name="minutes" defaultValue={previous?.minutes ?? minutes} min={5} max={600} step={5} aria-label="Minutes studied" />
          <span className="muted">min</span>
        </label>
      </div>
      <textarea className="input finish-note" name="note" rows={2} defaultValue={previous?.note ?? ""} maxLength={1000}
        placeholder="Note for your mentor, e.g. “Broadcasting was confusing” or “Konjunktiv II needs more practice”" />
      <div className="finish-row">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "✓ Mark as studied"}</button>
        <span className="muted" style={{ fontSize: 13 }}>The next lesson adapts to this. The time is logged in Routine.</span>
        {error && <span className="form-error">{error}</span>}
      </div>
    </form>
  );
}

// ---------- Flashcard review ----------
type ReviewCard = { id: string; front: string; back: string; example: string; trackName: string; box: number };

export function Review({ cards }: { cards: ReviewCard[] }) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ knew: 0, forgot: 0 });
  const [, start] = useTransition();
  const card = queue[0];
  const total = cards.length;

  const grade = useCallback((knew: boolean) => {
    if (!card) return;
    // Wrong cards come back once more at the end of this session.
    setQueue((q) => (knew ? q.slice(1) : [...q.slice(1), { ...q[0], box: -1 }]));
    setStats((s) => (knew ? { ...s, knew: s.knew + 1 } : { ...s, forgot: s.forgot + 1 }));
    setFlipped(false);
    if (card.box !== -1) start(() => reviewCard(card.id, knew)); // only the first answer counts for scheduling
  }, [card]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      if (flipped && (e.key === "1" || e.key === "ArrowLeft")) grade(false);
      if (flipped && (e.key === "2" || e.key === "ArrowRight")) grade(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, grade]);

  if (!total) return <div className="panel empty">No cards due. New words and concepts arrive with every lesson.</div>;
  if (!card) {
    return (
      <div className="panel review-end">
        <div className="kpi">{stats.knew}<small>of {stats.knew + stats.forgot} known</small></div>
        <p className="muted" style={{ margin: 0 }}>Session done. Forgotten cards come back tomorrow; known ones move to a longer interval.</p>
      </div>
    );
  }
  const done = total - queue.filter((c) => c.box !== -1).length;
  return (
    <div className="review">
      <div className="review-top">
        <span className="muted">{card.trackName}{card.box === -1 && " · again"}</span>
        <span className="mono muted">{Math.min(done + 1, total)} / {total}</span>
      </div>
      <div className="progress"><span style={{ width: `${(done / total) * 100}%` }} /></div>
      <button type="button" className="flash" data-flipped={flipped} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show front" : "Show answer"}>
        <span className="flash-front">{card.front}</span>
        {flipped ? (
          <span className="flash-back">
            <span className="flash-answer">{card.back}</span>
            {card.example && <span className="flash-example">{card.example}</span>}
          </span>
        ) : <span className="flash-hint">Tap or press Space to reveal</span>}
      </button>
      <div className="review-actions" data-show={flipped}>
        <button type="button" className="btn review-no" disabled={!flipped} onClick={() => grade(false)}><kbd>1</kbd> Didn’t know</button>
        <button type="button" className="btn primary" disabled={!flipped} onClick={() => grade(true)}><kbd>2</kbd> Knew it</button>
      </div>
    </div>
  );
}

export function CardList({ cards }: { cards: { id: string; front: string; back: string; box: number; due: string }[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const shown = useMemo(() => cards.filter((c) => !q || (c.front + " " + c.back).toLowerCase().includes(q.toLowerCase())).slice(0, 200), [cards, q]);
  return (
    <div className="panel" style={{ padding: "14px 24px", opacity: pending ? 0.7 : 1 }}>
      <input className="input" style={{ width: "100%", marginBottom: 6 }} placeholder={`Search ${cards.length} cards…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
      <div className="mini-list">
        {shown.map((c) => (
          <div key={c.id} className="card-row">
            <b>{c.front}</b><span className="muted">{c.back}</span>
            <span className="card-box" title={`Box ${c.box}, next review ${c.due}`}>{"●".repeat(c.box)}{"○".repeat(Math.max(0, 6 - c.box))}</span>
            <button type="button" className="icon-btn" aria-label={`Delete ${c.front}`} onClick={() => { if (confirm(`Delete card “${c.front}”?`)) start(() => removeCard(c.id)); }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Lectures ----------
export function LectureForm({ tracks, today, defaultTrack }: { tracks: { id: string; name: string }[]; today: string; defaultTrack?: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <form
      className="panel lecture-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            const r = await submitLecture({ trackId: String(v.get("trackId")), title: String(v.get("title") ?? ""), transcript: text, date: String(v.get("date") ?? "") });
            router.push(`/learn/lectures/${r.id}`);
          } catch (err) { setError(err instanceof Error ? err.message : "Could not start. Try again."); }
        });
      }}
    >
      <div className="quick-add">
        <select className="input" name="trackId" defaultValue={defaultTrack ?? tracks[0]?.id} aria-label="Course">
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input className="input grow" name="title" placeholder="Lecture title, e.g. Lecture 4: Grover’s algorithm" maxLength={120} aria-label="Lecture title" />
        <input className="input" type="date" name="date" defaultValue={today} aria-label="Lecture date" />
      </div>
      <textarea
        className="input transcript" value={text} onChange={(e) => setText(e.target.value)} rows={12}
        placeholder="Paste the live transcript of the lecture here (Live Text / captions). Errors and missing words are fine; it will be cleaned up."
        aria-label="Transcript"
      />
      <div className="finish-row">
        <button className="btn primary" type="submit" disabled={pending || text.trim().length < 200}>{pending ? "Starting…" : "Explain this lecture"}</button>
        <span className="muted mono" style={{ fontSize: 13 }}>{words.toLocaleString("en-GB")} words · {text.length.toLocaleString("en-GB")} / 200,000 chars</span>
        {error && <span className="form-error">{error}</span>}
      </div>
    </form>
  );
}

/** Reloads the page every few seconds while a note is being written. */
export function AutoRefresh({ every = 8000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

export function LectureActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {canRetry && <button type="button" className="btn sm" disabled={pending} onClick={() => start(() => retryLecture(id))}>↻ Regenerate</button>}
      <button
        type="button" className="btn sm" disabled={pending}
        onClick={() => { if (confirm("Delete this lecture note and its transcript?")) start(async () => { await removeLecture(id); router.push("/learn/lectures"); }); }}
      >
        Delete
      </button>
    </div>
  );
}

// ---------- Track settings ----------
export function TrackSettings({ track }: { track: { id: string; name: string; instructions: string; language: string; minutes: number; active: boolean } }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="panel track-settings"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        setSaved(false);
        start(async () => {
          await saveTrack(track.id, {
            name: String(v.get("name")), instructions: String(v.get("instructions")), language: String(v.get("language")),
            minutes: Number(v.get("minutes")), active: v.get("active") === "on",
          });
          setSaved(true);
        });
      }}
      onChange={() => setSaved(false)}
    >
      <label>Name<input className="input" name="name" defaultValue={track.name} maxLength={80} /></label>
      <label>Instructions <span className="muted">(paste your ChatGPT project instructions here)</span>
        <textarea className="input" name="instructions" defaultValue={track.instructions} rows={12} maxLength={20000} />
      </label>
      <label>Language rule<input className="input" name="language" defaultValue={track.language} maxLength={1000} /></label>
      <div className="finish-row">
        <label className="finish-min">Minutes per lesson <input className="input" type="number" name="minutes" defaultValue={track.minutes} min={5} max={300} step={5} /></label>
        <label className="toggle"><input type="checkbox" name="active" defaultChecked={track.active} /> Active</label>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {saved && <span className="muted">Saved. Used from the next lesson on.</span>}
      </div>
    </form>
  );
}
