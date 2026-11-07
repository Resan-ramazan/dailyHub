import "server-only";
import path from "node:path";
import { PERSONAL_DIR, localDate, newId, readJson, updateJson } from "./store";

const FILE = path.join(PERSONAL_DIR, "todos.json");

export type Priority = "high" | "normal" | "low";
export type Todo = {
  id: string;
  title: string;
  due: string | null;
  priority: Priority;
  pinned: boolean;
  done: boolean;
  doneAt: string | null;
  jobRef: { date: string; folder: string; company: string } | null;
  createdAt: string;
};

export const readTodos = () => readJson<Todo[]>(FILE, []);

export async function addTodo(input: { title: string; due?: string | null; priority?: Priority; pinned?: boolean; jobRef?: Todo["jobRef"] }) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  const todo: Todo = {
    id: newId(),
    title: title.slice(0, 300),
    due: input.due || null,
    priority: input.priority ?? "normal",
    pinned: input.pinned ?? false,
    done: false,
    doneAt: null,
    jobRef: input.jobRef ?? null,
    createdAt: new Date().toISOString(),
  };
  await updateJson<Todo[]>(FILE, [], (list) => { list.push(todo); });
  return todo;
}

export async function patchTodo(id: string, patch: Partial<Pick<Todo, "title" | "due" | "priority" | "pinned" | "done">>) {
  await updateJson<Todo[]>(FILE, [], (list) => {
    const t = list.find((x) => x.id === id);
    if (!t) throw new Error("Todo not found");
    if (patch.title !== undefined) { const v = patch.title.trim(); if (v) t.title = v.slice(0, 300); }
    if (patch.due !== undefined) t.due = patch.due || null;
    if (patch.priority !== undefined) t.priority = patch.priority;
    if (patch.pinned !== undefined) t.pinned = patch.pinned;
    if (patch.done !== undefined) { t.done = patch.done; t.doneAt = patch.done ? new Date().toISOString() : null; }
  });
}

export async function deleteTodo(id: string) {
  await updateJson<Todo[]>(FILE, [], (list) => list.filter((x) => x.id !== id));
}

const PRIO: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/** Open todos in the order they should be worked on: pinned, overdue/due, priority, due date. */
export function sortOpen(list: Todo[], today = localDate()) {
  return list
    .filter((t) => !t.done)
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(!!b.due && b.due <= today) - Number(!!a.due && a.due <= today) ||
      PRIO[a.priority] - PRIO[b.priority] ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.createdAt.localeCompare(b.createdAt));
}

/** "Big 3" for the Today page: pinned or due by today first, topped up with high priority items. */
export function bigThree(list: Todo[], today = localDate()) {
  const open = sortOpen(list, today);
  const urgent = open.filter((t) => t.pinned || (t.due && t.due <= today));
  const rest = open.filter((t) => !urgent.includes(t) && t.priority === "high");
  return [...urgent, ...rest].slice(0, 3);
}

/** Todos ticked off today, so the Today page can show progress. */
export const doneToday = (list: Todo[], today = localDate()) => list.filter((t) => t.done && t.doneAt && localDate(new Date(t.doneAt)) === today);
