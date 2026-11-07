import { CommandBar, DoneTray, NowCard, Ring, TaskCard } from "@/components/todo";
import { addDays, localDate } from "@/lib/store";
import { doneToday, readTodos, sortOpen } from "@/lib/todos";

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", o);

export default async function TodoPage() {
  const today = localDate();
  const todos = await readTodos();
  const open = sortOpen(todos, today);
  const finishedToday = doneToday(todos, today);

  // Timeline lanes: Late → Today → each of the next 6 days → Later → Someday.
  type Lane = { key: string; label: string; sub?: string; items: typeof open; hot?: boolean; showDate?: boolean; always?: boolean };
  const lanes: Lane[] = [
    { key: "late", label: "Overdue", items: open.filter((t) => !t.pinned && t.due && t.due < today), hot: true, showDate: true },
    { key: "today", label: "Today", sub: fmt(today, { weekday: "long", day: "numeric", month: "short" }), items: open.filter((t) => t.pinned || t.due === today), always: true },
  ];
  for (let n = 1; n <= 6; n++) {
    const d = addDays(today, n);
    lanes.push({
      key: d, label: n === 1 ? "Tomorrow" : fmt(d, { weekday: "long" }), sub: fmt(d, { day: "numeric", month: "short" }),
      items: open.filter((t) => !t.pinned && t.due === d),
    });
  }
  const weekEnd = addDays(today, 6);
  lanes.push(
    { key: "later", label: "Later", items: open.filter((t) => !t.pinned && t.due && t.due > weekEnd), showDate: true },
    { key: "someday", label: "Someday", sub: "No date", items: open.filter((t) => !t.pinned && !t.due) },
  );

  // "Now" queue: what's pinned or due, then high priority, then the rest.
  const nowQueue = open.slice(0, 5);
  const todayLoad = lanes[0].items.length + lanes[1].items.length + finishedToday.length;

  // Momentum: tasks finished per day over the last 14 days.
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = days.map((d) => todos.filter((t) => t.done && t.doneAt && localDate(new Date(t.doneAt)) === d).length);
  const peak = Math.max(1, ...perDay);
  const doneAll = todos.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).slice(0, 30);

  return (
    <>
      <header className="todo-hero">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Todo · {fmt(today, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="h1">
            {open.length === 0 ? "Inbox zero." : <>{open.length} {open.length === 1 ? "thing" : "things"}<span className="muted"> to do.</span></>}
          </h1>
        </div>
        <div className="hero-side">
          <Ring done={finishedToday.length} total={todayLoad} />
          <div className="momentum" aria-label="Tasks finished per day, last 14 days">
            <div className="momentum-bars">
              {perDay.map((c, i) => (
                <i key={days[i]} style={{ height: `${Math.max(6, (c / peak) * 100)}%` }} data-on={c > 0} data-today={i === 13} title={`${fmt(days[i], { weekday: "short", day: "numeric", month: "short" })}: ${c} done`} />
              ))}
            </div>
            <div className="momentum-label">Last 14 days · {perDay.reduce((a, b) => a + b, 0)} done</div>
          </div>
        </div>
      </header>

      <div className="todo-top">
        <NowCard queue={nowQueue} today={today} />
        <CommandBar today={today} />
      </div>

      <div className="timeline">
        {lanes.filter((l) => l.items.length || l.always).map((l) => (
          <section className="lane" key={l.key} data-key={l.key} data-hot={l.hot ?? false}>
            <div className="lane-head">
              <span className="lane-node" />
              <h2 className="lane-label">{l.label}</h2>
              {l.sub && <span className="lane-sub">{l.sub}</span>}
              <span className="lane-count">{l.items.length}</span>
            </div>
            <div className="lane-items">
              {l.items.length
                ? l.items.map((t) => <TaskCard key={t.id} todo={t} today={today} showDate={l.showDate} />)
                : <div className="lane-empty">Nothing due today. Pin a task or press <b>N</b> to add one.</div>}
            </div>
          </section>
        ))}
      </div>

      <DoneTray items={doneAll} today={today} />
    </>
  );
}
