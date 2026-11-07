import "server-only";
import path from "node:path";
import { PERSONAL_DIR, addDays, localDate, newId, readJson, updateJson } from "./store";

// ---------- Habits ----------
const HABITS = path.join(PERSONAL_DIR, "habits.json");
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type Habit = { id: string; name: string; days: number[] }; // days: 0 = Sunday … 6 = Saturday
export type HabitData = { habits: Habit[]; log: Record<string, string[]> };

/** Starter habits until the file exists. Fixed ids so the first check-off keeps them. */
const STARTER: HabitData = {
  habits: [
    { id: "german", name: "German · 20 min", days: ALL_DAYS },
    { id: "coding", name: "Coding · 1 task", days: ALL_DAYS },
    { id: "apply", name: "Apply to 1 job", days: [1, 2, 3, 4, 5] },
    { id: "exercise", name: "Exercise", days: ALL_DAYS },
  ],
  log: {},
};

export const readHabits = () => readJson<HabitData>(HABITS, structuredClone(STARTER));
const mutateHabits = (fn: (d: HabitData) => void) => updateJson<HabitData>(HABITS, structuredClone(STARTER), fn);

export const toggleHabit = (id: string, date: string) =>
  mutateHabits((d) => {
    const day = new Set(d.log[date] ?? []);
    if (day.has(id)) day.delete(id); else day.add(id);
    if (day.size) d.log[date] = [...day]; else delete d.log[date];
  });

export const addHabit = (name: string, days: number[]) =>
  mutateHabits((d) => {
    const n = name.trim();
    if (!n) throw new Error("Name is required");
    d.habits.push({ id: newId(), name: n.slice(0, 80), days: days.length ? days : ALL_DAYS });
  });

export const updateHabit = (id: string, patch: Partial<Omit<Habit, "id">>) =>
  mutateHabits((d) => {
    const h = d.habits.find((x) => x.id === id);
    if (!h) throw new Error("Habit not found");
    if (patch.name?.trim()) h.name = patch.name.trim().slice(0, 80);
    if (patch.days) h.days = patch.days.length ? patch.days : ALL_DAYS;
  });

export const deleteHabit = (id: string) =>
  mutateHabits((d) => {
    d.habits = d.habits.filter((h) => h.id !== id);
    for (const k of Object.keys(d.log)) {
      d.log[k] = d.log[k].filter((x) => x !== id);
      if (!d.log[k].length) delete d.log[k];
    }
  });

const scheduled = (h: Habit, iso: string) => h.days.includes(new Date(iso + "T12:00:00").getDay());
const doneOn = (d: HabitData, id: string, iso: string) => (d.log[iso] ?? []).includes(id);

/** Consecutive scheduled days completed. Today only counts once ticked, so an open today never breaks it. */
export function streak(d: HabitData, h: Habit, today = localDate()) {
  let n = 0;
  let day = doneOn(d, h.id, today) ? today : addDays(today, -1);
  for (let i = 0; i < 400; i++, day = addDays(day, -1)) {
    if (!scheduled(h, day)) continue;
    if (!doneOn(d, h.id, day)) break;
    n++;
  }
  return n;
}

/** Last 7 days ending today: done / missed / not scheduled. */
export function lastWeek(d: HabitData, h: Habit, today = localDate()) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, state: !scheduled(h, day) ? "off" : doneOn(d, h.id, day) ? "done" : day === today ? "open" : "missed" } as const;
  });
}

export function habitSummary(d: HabitData, today = localDate()) {
  const due = d.habits.filter((h) => scheduled(h, today));
  return {
    habits: d.habits.map((h) => ({ ...h, dueToday: scheduled(h, today), doneToday: doneOn(d, h.id, today), streak: streak(d, h, today), week: lastWeek(d, h, today) })),
    doneCount: due.filter((h) => doneOn(d, h.id, today)).length,
    dueCount: due.length,
  };
}

// ---------- Study planner ----------
const STUDY = path.join(PERSONAL_DIR, "study.json");

export type Course = { id: string; name: string };
export type Goal = { id: string; title: string; courseId: string | null; done: boolean; source: "manual" | "skill-gap" };
export type Deadline = { id: string; title: string; courseId: string | null; date: string; done: boolean };
export type Session = { id: string; title: string; courseId: string | null; date: string; minutes: number; done: boolean };
export type StudyData = { courses: Course[]; goals: Goal[]; deadlines: Deadline[]; sessions: Session[] };

const EMPTY_STUDY: StudyData = { courses: [], goals: [], deadlines: [], sessions: [] };
export const readStudy = () => readJson<StudyData>(STUDY, structuredClone(EMPTY_STUDY));
export const mutateStudy = (fn: (d: StudyData) => void) => updateJson<StudyData>(STUDY, structuredClone(EMPTY_STUDY), fn);

export function studyToday(d: StudyData, today = localDate()) {
  const courseName = (id: string | null) => d.courses.find((c) => c.id === id)?.name ?? null;
  const sessions = d.sessions.filter((s) => s.date === today).map((s) => ({ ...s, course: courseName(s.courseId) }));
  const upcoming = d.deadlines
    .filter((x) => !x.done && x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => ({ ...x, course: courseName(x.courseId), daysLeft: Math.round((new Date(x.date + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000) }));
  const weekMinutes = d.sessions.filter((s) => s.done && s.date > addDays(today, -7) && s.date <= today).reduce((a, s) => a + s.minutes, 0);
  return { sessions, upcoming, weekMinutes, openGoals: d.goals.filter((g) => !g.done) };
}
