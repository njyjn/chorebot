import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, tickTiming } from "./audit.ts";
import type { AuditCompletion, AuditTask } from "./audit.ts";

process.env.TZ = "Asia/Singapore";

const task = (id: number, cadence: string, extra: Partial<AuditTask> = {}): AuditTask => ({
  id,
  room: "Kitchen",
  name: `Task ${id}`,
  cadence,
  timesPer: 1,
  intervalDays: 2,
  createdDay: "2026-10-01",
  archivedDay: null,
  ...extra,
});

let nextId = 1;
const tick = (taskId: number, day: string, at = `${day}T10:00:00+08:00`, extra: Partial<AuditCompletion> = {}): AuditCompletion => ({
  id: nextId++,
  taskId,
  day,
  completedAt: new Date(at),
  source: "kiosk",
  deletedAt: null,
  ...extra,
});

test("tick timing", () => {
  assert.equal(tickTiming(tick(1, "2026-10-11"), "20:00"), "on_time");
  assert.equal(tickTiming(tick(1, "2026-10-11", "2026-10-11T20:15:00+08:00"), "20:00"), "late");
  assert.equal(tickTiming(tick(1, "2026-10-10", "2026-10-11T09:00:00+08:00"), "20:00"), "backfilled");
  assert.equal(tickTiming(tick(1, "2026-10-10", undefined, { source: "audit" }), "20:00"), "correction");
});

test("daily compliance counts every active day", () => {
  // Sun 11 to Sat 17 Oct; ticked 5 of 7 days
  const ticks = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"].map((d) => tick(1, d));
  const s = computeStats([task(1, "daily")], ticks, "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 7);
  assert.equal(s.totals.met, 5);
  assert.equal(s.tasks[0].missed, 2);
  assert.equal(s.days.find((d) => d.day === "2026-10-14")!.met, 0);
});

test("weekly chore done early counts as met", () => {
  const s = computeStats([task(1, "weekly")], [tick(1, "2026-10-13")], "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 1);
  assert.equal(s.tasks[0].compliance, 1);
});

test("extra ticks beyond the weekly target are ignored", () => {
  const ticks = [tick(1, "2026-10-12"), tick(1, "2026-10-13"), tick(1, "2026-10-14")];
  const s = computeStats([task(1, "weekly")], ticks, "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 1);
  assert.equal(s.totals.met, 1);
});

test("weekly done 4 of 5 weeks scores 80%", () => {
  // Thursdays from 1 Oct; the week of 18 Oct is skipped
  const ticks = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-29"].map((d) => tick(1, d));
  const s = computeStats([task(1, "weekly")], ticks, "2026-09-27", "2026-10-31", "20:00");
  assert.equal(s.tasks[0].required, 5);
  assert.equal(s.tasks[0].met, 4);
});

test("2x / week on Tuesday and Friday is fully compliant", () => {
  const t = task(1, "weekly", { timesPer: 2 });
  const s = computeStats([t], [tick(1, "2026-10-13"), tick(1, "2026-10-16")], "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 2);
  assert.equal(s.totals.met, 2);
});

test("weekly chore left to Saturday and missed", () => {
  const s = computeStats([task(1, "weekly")], [], "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 1);
  assert.equal(s.totals.missed, 1);
});

test("every 2 days keeps counting while overdue", () => {
  // done Sun, then nothing: due Tue and Wed
  const s = computeStats([task(1, "every_n_days")], [tick(1, "2026-10-11")], "2026-10-11", "2026-10-14", "20:00");
  assert.equal(s.totals.required, 3); // Sun, Tue, Wed
  assert.equal(s.totals.met, 1);
});

test("unticked rows do not count but are reported", () => {
  const removed = tick(1, "2026-10-11", undefined, { deletedAt: new Date("2026-10-11T11:00:00+08:00") });
  const s = computeStats([task(1, "daily")], [removed], "2026-10-11", "2026-10-11", "20:00");
  assert.equal(s.totals.met, 0);
  assert.equal(s.totals.unticks, 1);
  assert.equal(s.totals.ticks, 0);
});

test("tasks are only judged while active", () => {
  const t = task(1, "daily", { createdDay: "2026-10-13", archivedDay: "2026-10-15" });
  const s = computeStats([t], [], "2026-10-11", "2026-10-17", "20:00");
  assert.equal(s.totals.required, 2); // 13th and 14th
});

test("hourly histogram uses local hours and skips corrections", () => {
  const s = computeStats(
    [task(1, "daily")],
    [tick(1, "2026-10-11", "2026-10-11T19:55:00+08:00"), tick(1, "2026-10-12", undefined, { source: "audit" })],
    "2026-10-11",
    "2026-10-12",
    "20:00",
  );
  assert.equal(s.hourly[19], 1);
  assert.equal(s.hourly.reduce((a, b) => a + b, 0), 1);
  assert.equal(s.totals.late, 0);
  assert.equal(s.totals.corrections, 1);
});
