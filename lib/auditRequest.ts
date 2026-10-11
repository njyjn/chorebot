import { addDays, localDay, weekStart } from "@/lib/schedule";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RANGES = [7, 30, 90];

/** User name set by server.js, or null when the request did not come through ingress. */
export const auditUser = (request: Request) =>
  request.headers.get("x-chorebot-zone") === "audit" ? request.headers.get("x-chorebot-user") || "audit" : null;

export const notFound = () => new Response("Not found", { status: 404 });

export function parseView(params: URLSearchParams) {
  const days = Number(params.get("days"));
  const week = params.get("week") || "";
  return {
    rangeDays: RANGES.includes(days) ? days : 30,
    week: weekStart(DAY.test(week) ? week : localDay()),
  };
}

export const isDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value);

// Relative redirect back to the audit page, which works under any ingress prefix.
export function backTo(form: FormData, notice?: string) {
  const { rangeDays, week } = parseView(new URLSearchParams(String(form.get("back") || "")));
  const qs = new URLSearchParams({ days: String(rangeDays), week });
  if (notice) qs.set("notice", notice);
  return new Response(null, { status: 303, headers: { Location: `./?${qs}` } });
}

export const yesterday = () => addDays(localDay(), -1);
