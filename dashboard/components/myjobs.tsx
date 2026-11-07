"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeMyJob, retryMyJob, submitMyJob } from "@/app/actions";

/** Paste a link and/or the ad text; Claude tailors a CV and cover letter for it. */
export function MyJobForm() {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const ready = /^https?:\/\/\S+$/i.test(url.trim()) || text.trim().length >= 200;
  return (
    <form
      className="panel lecture-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await submitMyJob({ url, text, note });
            setUrl(""); setText(""); setNote(""); setDone(true);
            router.refresh();
          } catch (err) { setError(err instanceof Error ? err.message : "Could not start. Try again."); }
        });
      }}
    >
      <input
        className="input" type="url" value={url} onChange={(e) => { setUrl(e.target.value); setDone(false); }}
        placeholder="Link to the job ad, e.g. https://company.com/careers/working-student-ai" aria-label="Job link"
      />
      <textarea
        className="input transcript" value={text} onChange={(e) => { setText(e.target.value); setDone(false); }} rows={9}
        placeholder="…or paste the full ad text here. Best for LinkedIn or StepStone ads, or ads that need a login. If you give both, the text wins and the link is used for applying."
        aria-label="Job ad text"
      />
      <input
        className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
        placeholder="Optional note for this application, e.g. “stress my React Native app” or “I used Docker in my bachelor thesis”"
        aria-label="Note"
      />
      <div className="finish-row">
        <button className="btn primary" type="submit" disabled={pending || !ready}>{pending ? "Starting…" : "Tailor CV + cover letter"}</button>
        <span className="muted" style={{ fontSize: 13 }}>Claude writes both in about 5–10 minutes. You get a notification.</span>
        {done && <span className="muted" style={{ fontSize: 13 }}>✓ Started. It appears in the list below.</span>}
        {error && <span className="form-error">{error}</span>}
      </div>
    </form>
  );
}

export function MyJobActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span style={{ display: "flex", gap: 6 }}>
      {canRetry && <button type="button" className="btn sm" disabled={pending} onClick={() => start(() => retryMyJob(id))}>↻ Retry</button>}
      <button
        type="button" className="btn sm" disabled={pending}
        onClick={() => { if (confirm("Remove this request from the list? Prepared documents stay in the Jobs folder.")) start(() => removeMyJob(id)); }}
      >
        Remove
      </button>
    </span>
  );
}
