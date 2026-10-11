import { prisma } from "@/lib/prisma";
import { computeStats, tickTiming } from "@/lib/audit";
import type { ActivityEvent, GridTask } from "@/lib/auditPage";
import { renderAudit } from "@/lib/auditPage";
import { auditUser, notFound, parseView, yesterday } from "@/lib/auditRequest";
import { getOptions } from "@/lib/config";
import { addDays, localDay } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Long enough before the range to know every-N-days and monthly state.
const LOOKBACK_DAYS = 62;

export async function GET(request: Request) {
  const user = auditUser(request);
  if (!user) return notFound();

  const params = new URL(request.url).searchParams;
  const { rangeDays, week } = parseView(params);
  const { alertTime } = getOptions();
  const today = localDay();
  const end = yesterday();
  const start = addDays(end, -(rangeDays - 1));
  const from = [addDays(start, -LOOKBACK_DAYS), week].sort()[0];

  const [tasks, completions, alerts] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.completion.findMany({ where: { day: { gte: from } }, orderBy: { completedAt: "desc" } }),
    prisma.alertLog.findMany({ orderBy: { day: "desc" }, take: 30 }),
  ]);

  // Archived before archivedAt existed: no way to know when, so leave it out.
  const judged = tasks.filter((t) => !t.archived || t.archivedAt);
  const stats = computeStats(
    judged.map((t) => ({
      ...t,
      createdDay: localDay(t.createdAt),
      archivedDay: t.archivedAt ? localDay(t.archivedAt) : null,
    })),
    completions,
    start,
    end,
    alertTime,
  );

  const weekEnd = addDays(week, 6);
  const grid: GridTask[] = tasks
    .filter((t) => !t.archived)
    .map((t) => {
      const cells: GridTask["cells"] = {};
      for (const c of completions) {
        if (c.taskId !== t.id || c.deletedAt || c.day < week || c.day > weekEnd) continue;
        const cell = (cells[c.day] ??= { count: 0, timing: [] });
        cell.count++;
        cell.timing.push(tickTiming(c, alertTime));
      }
      return { ...t, cells };
    });

  const names = new Map(tasks.map((t) => [t.id, t.name]));
  const activity: ActivityEvent[] = completions
    .flatMap((c): ActivityEvent[] => {
      const task = names.get(c.taskId) ?? `#${c.taskId}`;
      const tick: ActivityEvent = {
        at: c.completedAt,
        kind: "tick",
        task,
        day: c.day,
        by: c.completedBy || c.source,
        timing: tickTiming(c, alertTime),
      };
      return c.deletedAt
        ? [tick, { at: c.deletedAt, kind: "untick", task, day: c.day, by: c.deletedBy || "" }]
        : [tick];
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 80);

  const html = renderAudit({
    user,
    today,
    rangeDays,
    week,
    alertTime,
    stats,
    grid,
    activity,
    alerts,
    notice: params.get("notice") || undefined,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
