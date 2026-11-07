import { AddStudyForm, CourseChip, HabitManager, HabitTile, SkillGapGoal, StudyRow } from "@/components/hub";
import { PageHead, Section, prettyDate } from "@/components/ui";
import { listDays, mdSection, readDayReport } from "@/lib/jobs";
import { habitSummary, readHabits, readStudy } from "@/lib/routine";
import { addDays, localDate } from "@/lib/store";

/** Bold phrases of the numbered list in the latest report's "Skill gaps" section. */
async function latestSkillGaps(): Promise<string[]> {
  for (const d of await listDays()) {
    const report = await readDayReport(d);
    const sec = report && mdSection(report, "Skill gaps");
    if (!sec) continue;
    return sec.split("\n").filter((l) => /^\d+\./.test(l.trim())).map((l) => l.match(/\*\*(.+?)\*\*/)?.[1]?.trim()).filter((x): x is string => !!x).slice(0, 6);
  }
  return [];
}

export default async function RoutinePage() {
  const today = localDate();
  const [habitData, study, gaps] = await Promise.all([readHabits(), readStudy(), latestSkillGaps()]);
  const habits = habitSummary(habitData, today);
  const course = (id: string | null) => study.courses.find((c) => c.id === id)?.name;
  const horizon = addDays(today, 14);
  const sessions = study.sessions.filter((s) => s.date >= today && s.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
  const deadlines = study.deadlines.filter((x) => !x.done || x.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const goals = [...study.goals].sort((a, b) => Number(a.done) - Number(b.done));
  const goalTitles = new Set(study.goals.filter((g) => !g.done).map((g) => g.title.toLowerCase()));
  const when = (d: string) => (d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : prettyDate(d, { weekday: "short", day: "numeric", month: "short" }));

  return (
    <>
      <PageHead eyebrow="Routine" title="Habits & study" sub="Small daily wins and a plan for your M.Sc. Tap a habit to check it for today." />

      <Section n="01" title="Today’s habits" aside={`${habits.doneCount} of ${habits.dueCount} done`}>
        <div className="habits">{habits.habits.map((h) => <HabitTile key={h.id} habit={h} />)}</div>
      </Section>

      <Section n="02" title="Manage habits" aside="Rename inline, choose the days each habit is due">
        <HabitManager habits={habitData.habits} />
      </Section>

      <div id="study" />
      <Section n="03" title="Courses" aside="Group sessions, deadlines and goals">
        <div className="chips" style={{ marginBottom: 12 }}>
          {study.courses.map((c) => <CourseChip key={c.id} id={c.id} name={c.name} />)}
          {!study.courses.length && <span className="muted">No courses yet.</span>}
        </div>
        <AddStudyForm kind="courses" courses={study.courses} today={today} />
      </Section>

      <Section n="04" title="Study sessions" aside="Next 14 days">
        <div className="panel list" style={{ marginBottom: 12 }}>
          {sessions.length ? sessions.map((s) => (
            <StudyRow key={s.id} kind="sessions" id={s.id} title={s.title} done={s.done} meta={<>{when(s.date)} · {s.minutes} min{course(s.courseId) && <> · {course(s.courseId)}</>}</>} />
          )) : <div className="todo"><span className="muted">No sessions planned.</span></div>}
        </div>
        <AddStudyForm kind="sessions" courses={study.courses} today={today} />
      </Section>

      <Section n="05" title="Deadlines" aside="Exams, assignments, applications">
        <div className="panel list" style={{ marginBottom: 12 }}>
          {deadlines.length ? deadlines.map((x) => (
            <StudyRow key={x.id} kind="deadlines" id={x.id} title={x.title} done={x.done} meta={<>{when(x.date)}{course(x.courseId) && <> · {course(x.courseId)}</>}</>} />
          )) : <div className="todo"><span className="muted">No deadlines.</span></div>}
        </div>
        <AddStudyForm kind="deadlines" courses={study.courses} today={today} />
      </Section>

      <Section n="06" title="Learning goals" aside="Turn Job Radar’s skill gaps into goals">
        {gaps.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Suggested from the latest job report</div>
            <div className="chips">{gaps.map((g) => <SkillGapGoal key={g} title={g} added={goalTitles.has(g.toLowerCase())} />)}</div>
          </div>
        )}
        <div className="panel list" style={{ marginBottom: 12 }}>
          {goals.length ? goals.map((g) => (
            <StudyRow key={g.id} kind="goals" id={g.id} title={g.title} done={g.done} meta={<>{g.source === "skill-gap" ? "From Job Radar" : "Personal"}{course(g.courseId) && <> · {course(g.courseId)}</>}</>} />
          )) : <div className="todo"><span className="muted">No goals yet.</span></div>}
        </div>
        <AddStudyForm kind="goals" courses={study.courses} today={today} />
      </Section>
    </>
  );
}
