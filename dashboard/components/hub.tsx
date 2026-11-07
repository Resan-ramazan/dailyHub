"use client";
import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  addStudy, checkHabit, createHabit, createTodo, editHabit, editTodo, removeHabit, removeStudy, removeTodo, toggleStudy,
} from "@/app/actions";

// ---------- shared bits ----------
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function Check({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="check" data-on={on} onClick={onToggle} aria-pressed={on} aria-label={label} disabled={disabled}>
      {on && <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>}
    </button>
  );
}

function dueLabel(due: string | null, today: string) {
  if (!due) return null;
  const days = Math.round((new Date(due + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
  if (days < 0) return { text: days === -1 ? "Yesterday" : `${-days} days overdue`, over: true };
  if (days === 0) return { text: "Today", over: false };
  if (days === 1) return { text: "Tomorrow", over: false };
  if (days < 7) return { text: new Date(due + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }), over: false };
  return { text: new Date(due + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), over: false };
}

// ---------- Todos ----------
export type TodoView = {
  id: string; title: string; due: string | null; priority: "high" | "normal" | "low"; pinned: boolean; done: boolean;
  jobRef: { date: string; folder: string; company: string } | null;
};

export function TodoRow({ todo, today }: { todo: TodoView; today: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(todo.done);
  const [editing, setEditing] = useState(false);
  const due = dueLabel(todo.due, today);
  const save = (patch: Parameters<typeof editTodo>[1]) => start(() => editTodo(todo.id, patch));
  return (
    <div className={`todo ${done ? "done" : ""}`} style={{ opacity: pending ? 0.6 : 1 }}>
      <Check on={done} label={done ? "Mark as not done" : "Mark as done"} onToggle={() => start(async () => { setDone(!done); await editTodo(todo.id, { done: !done }); })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget); save({ title: String(v.get("title")), due: String(v.get("due")) || null, priority: String(v.get("priority")) }); setEditing(false); }} className="todo-edit">
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
            <button type="button" className="todo-title" onClick={() => setEditing(true)} title="Edit">{todo.title}</button>
            <div className="todo-meta">
              {todo.priority === "high" && <span className="prio">High</span>}
              {due && <span className={due.over && !done ? "due over" : "due"}>{due.text}</span>}
              {todo.jobRef && <Link href={`/jobs/job/${todo.jobRef.date}/${encodeURIComponent(todo.jobRef.folder)}`}>{todo.jobRef.company} ↗</Link>}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="todo-actions">
          <button type="button" className="icon-btn" data-on={todo.pinned} onClick={() => save({ pinned: !todo.pinned })} aria-label={todo.pinned ? "Unpin" : "Pin to Today"} title={todo.pinned ? "Unpin" : "Pin to Today"}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill={todo.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"><path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6z" /></svg>
          </button>
          <button type="button" className="icon-btn" onClick={() => { if (confirm("Delete this todo?")) start(() => removeTodo(todo.id)); }} aria-label="Delete" title="Delete">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

export function QuickAddTodo({ defaultDue, placeholder = "Add a todo…" }: { defaultDue?: string; placeholder?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        const title = String(v.get("title") ?? "").trim();
        if (!title) return;
        setError(null);
        start(async () => {
          try {
            await createTodo({ title, due: String(v.get("due")) || null, priority: String(v.get("priority")), pinned: v.get("pinned") === "on" });
            ref.current?.reset();
          } catch { setError("Could not save. Try again."); }
        });
      }}
    >
      <input className="input grow" name="title" placeholder={placeholder} aria-label="New todo" maxLength={300} />
      <input className="input" type="date" name="due" defaultValue={defaultDue} aria-label="Due date" />
      <select className="input" name="priority" defaultValue="normal" aria-label="Priority">
        <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
      </select>
      <button className="btn primary" type="submit" disabled={pending}>Add</button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}

/** "Add todo" on a job page: Apply to X, due in 3 days. */
export function AddJobTodo({ job, due }: { job: { date: string; folder: string; company: string; title: string }; due: string }) {
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button" className="btn" disabled={pending || added}
      onClick={() => start(async () => {
        await createTodo({ title: `Apply to ${job.company}: ${job.title}`, due, priority: "high", jobRef: { date: job.date, folder: job.folder, company: job.company } });
        setAdded(true);
      })}
    >
      {added ? "Added to todos ✓" : "+ Add todo"}
    </button>
  );
}

// ---------- Habits ----------
export type HabitView = {
  id: string; name: string; days: number[]; dueToday: boolean; doneToday: boolean; streak: number;
  week: readonly { day: string; state: "off" | "done" | "missed" | "open" }[];
};

export function HabitTile({ habit }: { habit: HabitView }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(habit.doneToday);
  return (
    <button
      type="button" className="panel habit" data-on={on} data-rest={!habit.dueToday} aria-pressed={on}
      onClick={() => start(async () => { setOn(!on); await checkHabit(habit.id); })}
      style={{ opacity: pending ? 0.85 : 1 }}
    >
      <div className="habit-top">
        <span className="habit-name">{habit.name}</span>
        <span className="check" data-on={on} aria-hidden>{on && <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>}</span>
      </div>
      <div className="habit-foot">
        <span className="habit-streak">{habit.streak + (on && !habit.doneToday ? 1 : !on && habit.doneToday ? -1 : 0)}<small> day streak</small></span>
        <span className="week" aria-label="Last 7 days">
          {habit.week.map((w, i) => <i key={w.day} className={i === 6 ? (on ? "done" : habit.dueToday ? "open" : "off") : w.state} title={w.day} />)}
        </span>
      </div>
      {!habit.dueToday && <span className="habit-rest">Rest day</span>}
    </button>
  );
}

export function HabitManager({ habits }: { habits: { id: string; name: string; days: number[] }[] }) {
  const [pending, start] = useTransition();
  const [newDays, setNewDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div className="panel" style={{ padding: "8px 24px" }}>
      {habits.map((h) => (
        <div className="todo habit-row" key={h.id}>
          <input
            className="input bare grow" defaultValue={h.name} aria-label="Habit name"
            onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== h.name) start(() => editHabit(h.id, { name: v })); }}
          />
          <DayPicker value={h.days} onChange={(days) => start(() => editHabit(h.id, { days }))} />
          <button type="button" className="icon-btn" aria-label={`Delete ${h.name}`} onClick={() => { if (confirm(`Delete “${h.name}” and its history?`)) start(() => removeHabit(h.id)); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </button>
        </div>
      ))}
      <form
        ref={ref} className="todo habit-row" style={{ borderBottom: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
          if (!name) return;
          start(async () => { await createHabit(name, newDays); ref.current?.reset(); setNewDays([0, 1, 2, 3, 4, 5, 6]); });
        }}
      >
        <input className="input grow" name="name" placeholder="New habit, e.g. Read 10 pages" aria-label="New habit" maxLength={80} />
        <DayPicker value={newDays} onChange={setNewDays} />
        <button className="btn sm" type="submit" disabled={pending}>Add habit</button>
      </form>
    </div>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return (
    <span className="daypick" role="group" aria-label="Days">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <button
          type="button" key={d} data-on={value.includes(d)} aria-pressed={value.includes(d)}
          aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
        >{DAY_LETTERS[d]}</button>
      ))}
    </span>
  );
}

// ---------- Study ----------
type Kind = "goals" | "deadlines" | "sessions";

export function StudyRow({ kind, id, title, done, meta }: { kind: Kind; id: string; title: string; done: boolean; meta?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(done);
  return (
    <div className={`todo ${on ? "done" : ""}`} style={{ opacity: pending ? 0.6 : 1 }}>
      <Check on={on} label={on ? "Mark as not done" : "Mark as done"} onToggle={() => start(async () => { setOn(!on); await toggleStudy(kind, id); })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="todo-title static">{title}</div>
        {meta && <div className="todo-meta">{meta}</div>}
      </div>
      <button type="button" className="icon-btn" aria-label="Delete" onClick={() => { if (confirm("Delete this item?")) start(() => removeStudy(kind, id)); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
      </button>
    </div>
  );
}

export function AddStudyForm({ kind, courses, today }: { kind: "courses" | Kind; courses: { id: string; name: string }[]; today: string }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const placeholder = { courses: "Course, e.g. Machine Learning", goals: "Goal, e.g. Build a RAG project", deadlines: "Deadline, e.g. ML exam", sessions: "Session, e.g. Lecture 5 recap" }[kind];
  return (
    <form
      ref={ref} className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget);
        const text = String(v.get("text") ?? "").trim();
        if (!text) return;
        start(async () => {
          await addStudy(kind, { name: text, title: text, courseId: (v.get("courseId") as string) || null, date: (v.get("date") as string) || undefined, minutes: Number(v.get("minutes")) || undefined });
          ref.current?.reset();
        });
      }}
    >
      <input className="input grow" name="text" placeholder={placeholder} aria-label={placeholder} maxLength={160} />
      {kind !== "courses" && courses.length > 0 && (
        <select className="input" name="courseId" defaultValue="" aria-label="Course">
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {(kind === "deadlines" || kind === "sessions") && <input className="input" type="date" name="date" defaultValue={today} aria-label="Date" />}
      {kind === "sessions" && <input className="input" type="number" name="minutes" defaultValue={45} min={5} max={600} step={5} aria-label="Minutes" style={{ width: 90 }} />}
      <button className="btn sm" type="submit" disabled={pending}>Add</button>
    </form>
  );
}

export function CourseChip({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center", opacity: pending ? 0.5 : 1 }}>
      {name}
      <button type="button" className="icon-btn" style={{ padding: 0 }} aria-label={`Remove ${name}`} onClick={() => { if (confirm(`Remove course “${name}”?`)) start(() => removeStudy("courses", id)); }}>×</button>
    </span>
  );
}

export function SkillGapGoal({ title, added }: { title: string; added: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(added);
  return (
    <button type="button" className="chip" disabled={pending || done} onClick={() => start(async () => { await addStudy("goals", { title, source: "skill-gap" }); setDone(true); })}>
      {done ? "✓ " : "+ "}{title}
    </button>
  );
}
