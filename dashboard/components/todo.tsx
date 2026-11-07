"use client";
import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { createTodo, editTodo, removeTodo } from "@/app/actions";
import type { TodoView } from "./hub";

// ---------- date helpers (client side, local time) ----------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function plusDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Date(day + "T12:00:00").toLocaleDateString("en-GB", o);
function relative(day: string, today: string) {
  const diff = Math.round((new Date(day + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days late`;
  if (diff < 7) return fmt(day, { weekday: "long" });
  return fmt(day, { day: "numeric", month: "short" });
}

// ---------- smart input parser ----------
const WEEKDAYS = [
  ["sun", "sunday", "so", "sonntag"], ["mon", "monday", "mo", "montag"], ["tue", "tues", "tuesday", "di", "dienstag"],
  ["wed", "wednesday", "mi", "mittwoch"], ["thu", "thur", "thurs", "thursday", "do", "donnerstag"],
  ["fri", "friday", "fr", "freitag"], ["sat", "saturday", "sa", "samstag"],
];

export type Parsed = { title: string; due: string | null; priority: "high" | "normal" | "low"; pinned: boolean };

/**
 * "Call bank tomorrow !" → due tomorrow, high priority.
 * Understands: today/tod/heute, tomorrow/tmrw/morgen, weekday names (en/de), +3d / in3d,
 * "next week", "!" high, "~" low, "*" pin. Short German day names only count after "@".
 */
export function parseTask(raw: string, today: string): Parsed {
  let due: string | null = null;
  let priority: Parsed["priority"] = "normal";
  let pinned = false;
  const words: string[] = [];
  const toks = raw.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    let tok = toks[i];
    if (/^!+$/.test(tok)) { priority = "high"; continue; }
    if (tok === "~") { priority = "low"; continue; }
    if (tok === "*") { pinned = true; continue; }
    if (tok.length > 1 && tok.endsWith("!") && !tok.endsWith("?!")) { priority = "high"; tok = tok.replace(/!+$/, ""); }
    const at = tok.startsWith("@");
    const w = tok.replace(/^@/, "").toLowerCase();
    const next = toks[i + 1]?.toLowerCase();
    if (["today", "tod", "heute"].includes(w)) { due = today; continue; }
    if (["tomorrow", "tmrw", "tmr", "morgen"].includes(w)) { due = plusDays(today, 1); continue; }
    if (w === "next" && next === "week") {
      const dow = new Date(today + "T12:00:00").getDay();
      due = plusDays(today, ((8 - dow) % 7) || 7);
      i++; continue;
    }
    const rel = w.match(/^(?:\+|in)(\d{1,3})d$/) ?? (w === "in" && next?.match(/^(\d{1,3})d(?:ays?)?$/));
    if (rel) { due = plusDays(today, Number(rel[1])); if (w === "in") i++; continue; }
    const wd = WEEKDAYS.findIndex((names) => names.includes(w) && (at || w.length > 2));
    if (wd >= 0) {
      const dow = new Date(today + "T12:00:00").getDay();
      due = plusDays(today, ((wd - dow + 7) % 7) || 7);
      continue;
    }
    words.push(tok);
  }
  return { title: words.join(" "), due, priority, pinned };
}

// ---------- icons ----------
const Tick = () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>;
const PinIcon = ({ on }: { on: boolean }) => <svg viewBox="0 0 24 24" width="15" height="15" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"><path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6z" /></svg>;
const SnoozeIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h12M13 6l6 6-6 6" /></svg>;
const TrashIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;

// ---------- Command bar ----------
export function CommandBar({ today }: { today: string }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseTask(value, today), [value, today]);

  // "n" or "/" anywhere on the page jumps to the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "/") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    if (!parsed.title) return;
    setError(null);
    start(async () => {
      try {
        await createTodo(parsed);
        setValue("");
      } catch { setError("Could not save. Try again."); }
    });
  };

  const hasTokens = parsed.due || parsed.priority !== "normal" || parsed.pinned;
  return (
    <form className="cmd" onSubmit={(e) => { e.preventDefault(); submit(); }} data-busy={pending}>
      <span className="cmd-plus" aria-hidden>+</span>
      <input
        ref={input} className="cmd-input" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="Add a task… try “Send CV to Bosch fri !”" aria-label="New task" maxLength={300} autoComplete="off"
      />
      <span className="cmd-kbd" aria-hidden>N</span>
      <div className="cmd-preview" aria-live="polite">
        {value.trim() && hasTokens ? (
          <>
            {parsed.due && <span className="chip-s">◷ {relative(parsed.due, today)}</span>}
            {parsed.priority === "high" && <span className="chip-s hot">! High</span>}
            {parsed.priority === "low" && <span className="chip-s">~ Low</span>}
            {parsed.pinned && <span className="chip-s">✦ Pinned</span>}
            <span className="muted">Enter to add</span>
          </>
        ) : (
          <span className="muted">
            <b>tomorrow</b>, <b>fri</b>, <b>+3d</b>, <b>next week</b> set a date · <b>!</b> high · <b>~</b> low · <b>*</b> pin
          </span>
        )}
        {error && <span className="form-error">{error}</span>}
      </div>
    </form>
  );
}

// ---------- Now card: one thing at a time ----------
export function NowCard({ queue, today }: { queue: TodoView[]; today: string }) {
  const [i, setI] = useState(0);
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useState(false);
  if (!queue.length) {
    return (
      <div className="now empty-now">
        <div className="now-label">Now</div>
        <div className="now-title">All clear.</div>
        <p className="muted" style={{ margin: 0 }}>Nothing open. Add something above, or take the win.</p>
      </div>
    );
  }
  const t = queue[i % queue.length];
  const late = t.due && t.due < today;
  return (
    <div className={`now ${leaving ? "leaving" : ""}`} key={t.id}>
      <div className="now-label">
        <span className="now-dot" /> Now{queue.length > 1 && <span className="muted"> · {(i % queue.length) + 1} of {queue.length}</span>}
      </div>
      <div className="now-title">{t.title}</div>
      <div className="now-meta">
        {t.priority === "high" && <span className="chip-s hot">! High</span>}
        {t.pinned && <span className="chip-s">✦ Pinned</span>}
        {t.due && <span className={`chip-s ${late ? "hot" : ""}`}>◷ {relative(t.due, today)}</span>}
        {t.jobRef && <Link className="chip-s" href={`/jobs/job/${t.jobRef.date}/${encodeURIComponent(t.jobRef.folder)}`}>{t.jobRef.company} ↗</Link>}
      </div>
      <div className="now-actions">
        <button
          type="button" className="btn primary" disabled={pending}
          onClick={() => start(async () => { setLeaving(true); await editTodo(t.id, { done: true }); setLeaving(false); setI(0); })}
        >
          <Tick /> Done
        </button>
        {queue.length > 1 && <button type="button" className="btn" onClick={() => setI(i + 1)}>Not now →</button>}
      </div>
    </div>
  );
}

// ---------- Progress ring ----------
export function Ring({ done, total }: { done: number; total: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="ring" role="img" aria-label={`${done} of ${total} done today`}>
      <svg viewBox="0 0 80 80" width="88" height="88">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 40 40)" style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="ring-num"><b>{done}</b><small>/{total}</small></div>
    </div>
  );
}

// ---------- Task card ----------
export function TaskCard({ todo, today, showDate }: { todo: TodoView; today: string; showDate?: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(todo.done);
  const [editing, setEditing] = useState(false);
  const save = (patch: Parameters<typeof editTodo>[1]) => start(() => editTodo(todo.id, patch));
  const late = !done && todo.due && todo.due < today;
  const snoozeTo = plusDays(todo.due && todo.due > today ? todo.due : today, 1);

  return (
    <div className={`task p-${todo.priority}`} data-done={done} data-pending={pending}>
      <button
        type="button" className="check" data-on={done} aria-pressed={done} aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => start(async () => { setDone(!done); await editTodo(todo.id, { done: !done }); })}
      >
        {done && <Tick />}
      </button>
      <div className="task-body">
        {editing ? (
          <form
            className="todo-edit"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              save({ title: String(v.get("title")), due: String(v.get("due")) || null, priority: String(v.get("priority")) });
              setEditing(false);
            }}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          >
            <input className="input" name="title" defaultValue={todo.title} autoFocus aria-label="Title" />
            <input className="input" type="date" name="due" defaultValue={todo.due ?? ""} aria-label="Due date" />
            <select className="input" name="priority" defaultValue={todo.priority} aria-label="Priority">
              <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
            </select>
            <button className="btn sm" type="submit">Save</button>
            <button className="btn sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <button type="button" className="task-title" onClick={() => setEditing(true)} title="Click to edit">{todo.title}</button>
            {(todo.priority === "high" || todo.pinned || (showDate && todo.due) || late || todo.jobRef) && (
              <div className="task-meta">
                {todo.priority === "high" && <span className="hot">High</span>}
                {todo.pinned && <span>✦ Pinned</span>}
                {(showDate || late) && todo.due && <span className={late ? "hot" : ""}>{relative(todo.due, today)}</span>}
                {todo.jobRef && <Link href={`/jobs/job/${todo.jobRef.date}/${encodeURIComponent(todo.jobRef.folder)}`}>{todo.jobRef.company} ↗</Link>}
              </div>
            )}
          </>
        )}
      </div>
      {!editing && !done && (
        <div className="task-actions">
          <button type="button" className="icon-btn" onClick={() => save({ due: snoozeTo })} aria-label={`Push to ${relative(snoozeTo, today)}`} title={`Push to ${relative(snoozeTo, today)}`}><SnoozeIcon /></button>
          <button type="button" className="icon-btn" data-on={todo.pinned} onClick={() => save({ pinned: !todo.pinned })} aria-label={todo.pinned ? "Unpin" : "Pin to Today"} title={todo.pinned ? "Unpin" : "Pin to Today"}><PinIcon on={todo.pinned} /></button>
          <button type="button" className="icon-btn" onClick={() => { if (confirm("Delete this task?")) start(() => removeTodo(todo.id)); }} aria-label="Delete" title="Delete"><TrashIcon /></button>
        </div>
      )}
    </div>
  );
}

// ---------- Done tray ----------
export function DoneTray({ items, today }: { items: TodoView[]; today: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="tray">
      <button type="button" className="tray-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tray-caret" data-open={open}>▸</span> Completed <span className="muted">· {items.length}</span>
      </button>
      {open && <div className="tray-list">{items.map((t) => <TaskCard key={t.id} todo={t} today={today} />)}</div>}
    </div>
  );
}
