// Compliance statistics for the audit page. Pure: callers load the rows.
//
// A task is *required* on a day when, before that day's ticks, the same rule
// the alerts use says it is due. It is *met* if it was ticked that day and
// *missed* otherwise (exactly the days an alert would have listed it).
// A tick before the chore falls due also counts as a met requirement, as
// long as the week/month still needed it, so doing chores early scores well
// and extra ticks beyond the target are ignored.
import { addDays, frequencyLabel, localDay, taskStatus } from "./schedule.ts";
import type { TaskRule } from "./schedule.ts";

export interface AuditTask extends TaskRule {
  id: number;
  room: string;
  name: string;
  createdDay: string;
  archivedDay: string | null;
}

export interface AuditCompletion {
  id: number;
  taskId: number;
  day: string;
  completedAt: Date;
  source: string;
  deletedAt: Date | null;
}

export type TickTiming = "on_time" | "late" | "backfilled" | "correction";

export interface TaskStats {
  id: number;
  room: string;
  name: string;
  frequency: string;
  required: number;
  met: number;
  missed: number;
  late: number;
  compliance: number | null;
}

export interface DayStats {
  day: string;
  required: number;
  met: number;
}

export interface AuditStats {
  start: string;
  end: string;
  tasks: TaskStats[];
  days: DayStats[];
  totals: {
    required: number;
    met: number;
    missed: number;
    ticks: number;
    onTime: number;
    late: number;
    backfilled: number;
    corrections: number;
    unticks: number;
    compliance: number | null;
  };
  // kiosk ticks by local hour of day
  hourly: number[];
}

const ratio = (met: number, required: number) => (required ? met / required : null);

/**
 * late: ticked on its own day but at or after the alert time.
 * backfilled: ticked on a later day than the one it counts for.
 * correction: entered from the audit page.
 */
export function tickTiming(c: Pick<AuditCompletion, "day" | "completedAt" | "source">, alertTime: string): TickTiming {
  if (c.source === "audit") return "correction";
  const tickedDay = localDay(c.completedAt);
  if (tickedDay > c.day) return "backfilled";
  return c.completedAt.toTimeString().slice(0, 5) >= alertTime ? "late" : "on_time";
}

const activeOn = (task: AuditTask, day: string) =>
  day >= task.createdDay && (task.archivedDay === null || day < task.archivedDay);

export function computeStats(
  tasks: AuditTask[],
  completions: AuditCompletion[],
  start: string,
  end: string,
  alertTime: string,
): AuditStats {
  const live = completions.filter((c) => c.deletedAt === null);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const dayStats = new Map(days.map((d) => [d, { day: d, required: 0, met: 0 }]));

  const timing = new Map(live.map((c) => [c.id, tickTiming(c, alertTime)]));
  const inRange = (c: AuditCompletion) => c.day >= start && c.day <= end;

  const taskStats = tasks.map((task) => {
    const own = live.filter((c) => c.taskId === task.id);
    const tickDays = own.map((c) => c.day).sort();
    let required = 0;
    let met = 0;

    for (const day of days) {
      if (!activeOn(task, day)) continue;
      const before = tickDays.filter((d) => d < day);
      const kind = taskStatus(task, before, day).kind;
      const done = tickDays.includes(day);
      // Due: an obligation, met or missed. Ticked ahead of time while the
      // period still needed it: an obligation met early. Already satisfied
      // or not ticked: nothing owed today.
      if (kind !== "due" && !(done && kind !== "done")) continue;
      required++;
      if (done) met++;
      const ds = dayStats.get(day)!;
      ds.required++;
      if (done) ds.met++;
    }

    return {
      id: task.id,
      room: task.room,
      name: task.name,
      frequency: frequencyLabel(task),
      required,
      met,
      missed: required - met,
      late: own.filter((c) => inRange(c) && ["late", "backfilled"].includes(timing.get(c.id)!)).length,
      compliance: ratio(met, required),
    };
  });

  const ranged = live.filter(inRange);
  const count = (t: TickTiming) => ranged.filter((c) => timing.get(c.id) === t).length;
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const c of ranged) if (c.source !== "audit") hourly[c.completedAt.getHours()]++;

  const required = taskStats.reduce((n, t) => n + t.required, 0);
  const met = taskStats.reduce((n, t) => n + t.met, 0);

  return {
    start,
    end,
    tasks: taskStats,
    days: Array.from(dayStats.values()),
    totals: {
      required,
      met,
      missed: required - met,
      ticks: ranged.length,
      onTime: count("on_time"),
      late: count("late"),
      backfilled: count("backfilled"),
      corrections: count("correction"),
      unticks: completions.filter((c) => c.deletedAt !== null && inRange(c)).length,
      compliance: ratio(met, required),
    },
    hourly,
  };
}
