// Server-rendered HTML for the audit pages. It is served under Home
// Assistant ingress, whose URL prefix changes per session, so every link,
// form action and redirect is relative and there are no /_next assets.
import type { AuditStats, TickTiming } from "./audit.ts";
import { addDays, frequencyLabel } from "./schedule.ts";

export interface GridTask {
  id: number;
  room: string;
  name: string;
  cadence: string;
  timesPer: number;
  intervalDays: number;
  cells: Record<string, { count: number; timing: TickTiming[] }>;
}

export interface ActivityEvent {
  at: Date;
  kind: "tick" | "untick";
  task: string;
  day: string;
  by: string;
  timing?: TickTiming;
}

export interface AuditView {
  user: string;
  today: string;
  rangeDays: number;
  week: string;
  alertTime: string;
  stats: AuditStats;
  grid: GridTask[];
  activity: ActivityEvent[];
  alerts: { day: string; sentAt: Date; count: number }[];
  notice?: string;
}

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

const tone = (v: number | null) => (v === null ? "muted" : v >= 0.9 ? "good" : v >= 0.7 ? "warn" : "bad");

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", opts);

const fmtTime = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const TIMING_LABEL: Record<TickTiming, string> = {
  on_time: "on time",
  late: "after alert",
  backfilled: "backfilled",
  correction: "correction",
};

export const backQuery = (rangeDays: number, week: string) => `days=${rangeDays}&week=${week}`;

const STYLES = `
:root { --bg:#f6f7f9; --card:#fff; --text:#1f2328; --muted:#6b7280; --line:#e5e7eb;
  --good:#2e7d32; --warn:#e68a00; --bad:#d32f2f; --accent:#2563eb; --soft:#eef2ff; }
@media (prefers-color-scheme: dark) { :root { --bg:#111317; --card:#1a1d23; --text:#e6e8eb;
  --muted:#9aa3ae; --line:#2b3038; --good:#5cb85f; --warn:#f0a43a; --bad:#ef5350; --accent:#6c9cff; --soft:#1f2740; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
main { max-width:1180px; margin:0 auto; padding:16px; }
header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:12px; }
h1 { font-size:1.5rem; margin:0; }
h2 { font-size:1.05rem; margin:0 0 10px; }
.muted { color:var(--muted); }
.seg a { display:inline-block; padding:6px 12px; border:1px solid var(--line); background:var(--card); color:var(--text); text-decoration:none; }
.seg a:first-child { border-radius:8px 0 0 8px; } .seg a:last-child { border-radius:0 8px 8px 0; }
.seg a.on { background:var(--accent); border-color:var(--accent); color:#fff; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:16px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:16px; }
.tile { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
.tile b { display:block; font-size:1.6rem; font-variant-numeric:tabular-nums; }
.good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:middle; }
th { font-size:.8rem; color:var(--muted); font-weight:600; white-space:nowrap; }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
.bar { height:8px; background:var(--line); border-radius:4px; overflow:hidden; min-width:80px; }
.bar i { display:block; height:100%; }
.bar i.good { background:var(--good); } .bar i.warn { background:var(--warn); } .bar i.bad { background:var(--bad); }
svg text { fill:var(--muted); font-size:10px; }
.grid td.cell, .grid th.cell { text-align:center; padding:0; width:52px; }
.grid td.today, .grid th.today { background:var(--soft); }
.grid form { margin:0; }
.grid button { width:100%; height:38px; border:0; background:transparent; color:var(--good); font-weight:700; cursor:pointer; font-size:1rem; }
.grid button.late { color:var(--warn); } .grid button.correction { color:var(--accent); }
.grid button:hover:not(:disabled) { background:var(--soft); }
.grid button:disabled { cursor:default; }
.legend span { margin-right:14px; font-size:.85rem; }
.nav a { color:var(--accent); text-decoration:none; font-weight:600; padding:0 6px; }
.notice { background:var(--soft); border:1px solid var(--accent); border-radius:10px; padding:8px 12px; margin-bottom:12px; }
input, select { font:inherit; color:var(--text); background:var(--card); border:1px solid var(--line); border-radius:8px; padding:6px 8px; }
input.n { width:64px; }
.btn { font:inherit; border:0; border-radius:8px; padding:7px 12px; background:var(--accent); color:#fff; cursor:pointer; font-weight:600; }
.btn.ghost { background:transparent; color:var(--bad); }
.inline { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.tag { font-size:.75rem; padding:1px 6px; border-radius:6px; border:1px solid var(--line); white-space:nowrap; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:820px) { .cols { grid-template-columns:1fr; } }
`;

function dailyChart(stats: AuditStats) {
  const w = 720;
  const h = 130;
  const n = stats.days.length;
  const gap = n > 40 ? 1 : 3;
  const bw = (w - gap * (n - 1)) / n;
  const colors = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", muted: "var(--line)" };
  const bars = stats.days
    .map((d, i) => {
      const r = d.required ? d.met / d.required : null;
      const bh = r === null ? 3 : Math.max(3, r * (h - 22));
      const x = i * (bw + gap);
      const label = `${fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${d.met}/${d.required} (${pct(r)})`;
      return `<rect x="${x.toFixed(1)}" y="${(h - 18 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${colors[tone(r)]}"><title>${esc(label)}</title></rect>`;
    })
    .join("");
  const step = Math.ceil(n / 8);
  const labels = stats.days
    .map((d, i) =>
      i % step === 0
        ? `<text x="${i === 0 ? 0 : (i * (bw + gap) + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="${i === 0 ? "start" : "middle"}">${esc(fmtDay(d.day, { day: "numeric", month: "short" }))}</text>`
        : "",
    )
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Daily compliance">${bars}${labels}</svg>`;
}

function hourlyChart(hourly: number[], alertTime: string) {
  const w = 480;
  const h = 120;
  const max = Math.max(1, ...hourly);
  const bw = w / 24;
  const alertHour = Number(alertTime.slice(0, 2));
  const bars = hourly
    .map((v, hr) => {
      const bh = (v / max) * (h - 22);
      return `<rect x="${(hr * bw + 1).toFixed(1)}" y="${(h - 18 - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${hr >= alertHour ? "var(--warn)" : "var(--accent)"}"><title>${String(hr).padStart(2, "0")}:00 – ${v} tick${v === 1 ? "" : "s"}</title></rect>`;
    })
    .join("");
  const labels = [0, 3, 6, 9, 12, 15, 18, 21]
    .map((hr) => `<text x="${(hr * bw + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle">${String(hr).padStart(2, "0")}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Ticks by hour">${bars}${labels}</svg>`;
}

function weekGrid(view: AuditView) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(view.week, i));
  const back = esc(backQuery(view.rangeDays, view.week));
  const head = days
    .map((d) => `<th class="cell ${d === view.today ? "today" : ""}">${esc(fmtDay(d, { weekday: "short" }))}<br>${esc(fmtDay(d, { day: "numeric" }))}</th>`)
    .join("");
  const rows = view.grid
    .map((t) => {
      const cells = days
        .map((d) => {
          const cell = t.cells[d] ?? { count: 0, timing: [] };
          const future = d > view.today;
          const cls = cell.timing.includes("correction")
            ? "correction"
            : cell.timing.some((x) => x === "late" || x === "backfilled")
              ? "late"
              : "";
          const mark = cell.count > 1 ? `✓×${cell.count}` : cell.count === 1 ? "✓" : "";
          const tip = cell.count
            ? `${cell.timing.map((x) => TIMING_LABEL[x]).join(", ")} · click to remove one`
            : future
              ? ""
              : "Click to record as done";
          return `<td class="cell ${d === view.today ? "today" : ""}"><form method="post" action="completions">
<input type="hidden" name="taskId" value="${t.id}"><input type="hidden" name="day" value="${d}">
<input type="hidden" name="op" value="${cell.count ? "remove" : "add"}"><input type="hidden" name="back" value="${back}">
<button class="${cls}" title="${esc(tip)}" ${future ? "disabled" : ""}>${mark}</button></form></td>`;
        })
        .join("");
      return `<tr><td class="muted">${esc(t.room)}</td><td>${esc(t.name)}</td><td class="muted">${esc(frequencyLabel(t))}</td>${cells}</tr>`;
    })
    .join("");
  const prev = backQuery(view.rangeDays, addDays(view.week, -7));
  const next = backQuery(view.rangeDays, addDays(view.week, 7));
  return `<div class="card"><div class="inline" style="justify-content:space-between;margin-bottom:8px">
<h2 style="margin:0">Week of ${esc(fmtDay(view.week, { day: "numeric", month: "short", year: "numeric" }))}</h2>
<span class="nav"><a href="?${esc(prev)}">‹ Prev</a><a href="?${esc(backQuery(view.rangeDays, ""))}">This week</a><a href="?${esc(next)}">Next ›</a></span></div>
<p class="legend muted"><span class="good">✓ on time</span><span class="warn">✓ after alert / backfilled</span><span style="color:var(--accent)">✓ correction</span>Click a cell to correct it.</p>
<div class="scroll"><table class="grid"><thead><tr><th>Room</th><th>Chore</th><th>Frequency</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function manage(view: AuditView) {
  const back = esc(backQuery(view.rangeDays, view.week));
  const cadence = (selected: string) =>
    [
      ["daily", "Daily"],
      ["every_n_days", "Every N days"],
      ["weekly", "Per week"],
      ["monthly", "Per month"],
    ]
      .map(([v, l]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${l}</option>`)
      .join("");
  const num = (t: { cadence: string; timesPer: number; intervalDays: number }) =>
    t.cadence === "every_n_days" ? t.intervalDays : t.timesPer;
  const rows = view.grid
    .map(
      (t) => `<tr><td colspan="2"><form method="post" action="tasks" class="inline">
<input type="hidden" name="op" value="edit"><input type="hidden" name="id" value="${t.id}"><input type="hidden" name="back" value="${back}">
<input name="room" value="${esc(t.room)}" required><input name="name" value="${esc(t.name)}" required size="32">
<select name="cadence">${cadence(t.cadence)}</select><input class="n" type="number" name="n" min="1" value="${num(t)}">
<button class="btn">Save</button></form></td>
<td style="text-align:right"><form method="post" action="tasks" onsubmit="return confirm('Remove this chore? Its history is kept.')">
<input type="hidden" name="op" value="archive"><input type="hidden" name="id" value="${t.id}"><input type="hidden" name="back" value="${back}">
<button class="btn ghost">Remove</button></form></td></tr>`,
    )
    .join("");
  return `<div class="card"><h2>Manage chores</h2>
<form method="post" action="tasks" class="inline" style="margin-bottom:12px">
<input type="hidden" name="op" value="add"><input type="hidden" name="back" value="${back}">
<input name="room" placeholder="Room" required><input name="name" placeholder="Chore" required size="32">
<select name="cadence">${cadence("daily")}</select><input class="n" type="number" name="n" min="1" value="1" title="Times per period, or days between">
<button class="btn">Add chore</button></form>
<p class="muted" style="margin-top:0">The number is times per week/month, or the days between ticks for “Every N days”.</p>
<div class="scroll"><table><tbody>${rows}</tbody></table></div></div>`;
}

export function renderAudit(view: AuditView) {
  const { stats } = view;
  const t = stats.totals;
  const range = [7, 30, 90]
    .map((d) => `<a class="${d === view.rangeDays ? "on" : ""}" href="?${esc(backQuery(d, view.week))}">${d} days</a>`)
    .join("");

  const tiles = [
    ["Compliance", pct(t.compliance), tone(t.compliance), `${t.met} of ${t.required} required`],
    ["Missed", t.missed, t.missed ? "bad" : "good", "chore-days an alert would list"],
    ["On-time ticks", t.ticks ? pct(t.onTime / t.ticks) : "–", "", `${t.onTime} of ${t.ticks} ticks`],
    ["After alert", t.late, t.late ? "warn" : "", `ticked at or after ${view.alertTime}`],
    ["Backfilled", t.backfilled, t.backfilled ? "warn" : "", "ticked on a later day"],
    ["Unticks", t.unticks, "", "ticks removed"],
    ["Corrections", t.corrections, "", "entered here"],
  ]
    .map(([label, value, cls, sub]) => `<div class="tile"><span class="muted">${label}</span><b class="${cls}">${esc(value)}</b><span class="muted" style="font-size:.8rem">${esc(sub)}</span></div>`)
    .join("");

  const taskRows = [...stats.tasks]
    .sort((a, b) => (a.compliance ?? 2) - (b.compliance ?? 2) || b.missed - a.missed)
    .map(
      (s) => `<tr><td>${esc(s.name)}<div class="muted" style="font-size:.8rem">${esc(s.room)}</div></td><td class="muted">${esc(s.frequency)}</td>
<td class="num">${s.required}</td><td class="num">${s.met}</td><td class="num ${s.missed ? "bad" : ""}">${s.missed}</td><td class="num ${s.late ? "warn" : ""}">${s.late}</td>
<td><div class="inline"><div class="bar" style="flex:1"><i class="${tone(s.compliance)}" style="width:${s.compliance === null ? 0 : Math.round(s.compliance * 100)}%"></i></div><span class="num ${tone(s.compliance)}" style="width:3.2em;text-align:right">${pct(s.compliance)}</span></div></td></tr>`,
    )
    .join("");

  const activity = view.activity
    .map(
      (e) => `<tr><td class="muted" style="white-space:nowrap">${esc(fmtTime(e.at))}</td><td>${e.kind === "tick" ? "✓" : "✗ untick"}</td><td>${esc(e.task)}</td>
<td class="muted" style="white-space:nowrap">${esc(fmtDay(e.day, { weekday: "short", day: "numeric", month: "short" }))}</td><td class="muted">${esc(e.by)}</td>
<td>${e.timing && e.timing !== "on_time" ? `<span class="tag ${e.timing === "correction" ? "" : "warn"}">${TIMING_LABEL[e.timing]}</span>` : ""}</td></tr>`,
    )
    .join("");

  const alerts = view.alerts
    .map((a) => `<tr><td>${esc(fmtDay(a.day, { weekday: "short", day: "numeric", month: "short" }))}</td><td class="muted">${esc(fmtTime(a.sentAt))}</td><td class="num ${a.count ? "bad" : "good"}">${a.count ? `${a.count} overdue` : "all done"}</td></tr>`)
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chore Audit</title><style>${STYLES}</style></head><body><main>
<header><div><h1>Chore audit</h1><span class="muted">${esc(fmtDay(stats.start, { day: "numeric", month: "short" }))} – ${esc(fmtDay(stats.end, { day: "numeric", month: "short", year: "numeric" }))} · up to yesterday · signed in as ${esc(view.user)}</span></div>
<nav class="seg">${range}</nav></header>
${view.notice ? `<div class="notice">${esc(view.notice)}</div>` : ""}
<div class="tiles">${tiles}</div>
<div class="card"><h2>Daily compliance</h2>${dailyChart(stats)}</div>
<div class="card"><h2>By chore</h2><div class="scroll"><table><thead><tr><th>Chore</th><th>Frequency</th><th class="num">Required</th><th class="num">Done</th><th class="num">Missed</th><th class="num">Late</th><th>Compliance</th></tr></thead><tbody>${taskRows}</tbody></table></div>
<p class="muted" style="margin-bottom:0">Each time a chore falls due counts once: done that day (or earlier, before it fell due) is met; every day it stays overdue is another miss, matching the nightly alert.</p></div>
<div class="cols"><div class="card"><h2>When chores get ticked</h2>${hourlyChart(stats.hourly, view.alertTime)}<p class="muted" style="margin-bottom:0">Orange bars are at or after the ${esc(view.alertTime)} alert. A spike just before it suggests ticking in bulk.</p></div>
<div class="card"><div class="inline" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0">Alerts sent</h2>
<form method="post" action="test-alert"><input type="hidden" name="back" value="${esc(backQuery(view.rangeDays, view.week))}"><button class="btn">Send test alert</button></form></div><div class="scroll" style="max-height:220px;overflow-y:auto"><table><tbody>${alerts || `<tr><td class="muted">No alerts yet</td></tr>`}</tbody></table></div></div></div>
${weekGrid(view)}
<div class="card"><h2>Recent activity</h2><div class="scroll" style="max-height:420px;overflow-y:auto"><table><thead><tr><th>When</th><th></th><th>Chore</th><th>For</th><th>By</th><th></th></tr></thead><tbody>${activity || `<tr><td class="muted">Nothing yet</td></tr>`}</tbody></table></div></div>
${manage(view)}
</main></body></html>`;
}
