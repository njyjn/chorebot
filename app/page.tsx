"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

type Kind = "done" | "due" | "pending" | "not_due";

interface Chore {
  id: number;
  room: string;
  name: string;
  frequency: string;
  status: { kind: Kind; doneToday: number; label: string };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SECTIONS: { kind: Kind; title: string }[] = [
  { kind: "due", title: "To do today" },
  { kind: "pending", title: "Coming up this week / month" },
  { kind: "done", title: "Done" },
  { kind: "not_due", title: "Not due today" },
];

const STYLES = `
  .wrap { max-width: 1100px; margin: 0 auto; padding: 0 1rem; }
  .header { background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); padding-top: 1rem; padding-bottom: 0.25rem; }
  .title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  h1 { margin: 0; font-size: 1.75rem; color: #333; }
  .reminders { background: #fdecea; border: 2px solid #e57373; border-radius: 12px; padding: 0.75rem 1rem; margin: 1rem 0 0; color: #b71c1c; }
  .reminders strong { display: block; margin-bottom: 0.35rem; letter-spacing: 0.03em; }
  .reminders ol { margin: 0; padding-left: 1.25rem; }
  .progress { margin: 1rem 0; background: #fff; border-radius: 12px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .bar { height: 10px; background: #eee; border-radius: 5px; overflow: hidden; margin-top: 0.5rem; }
  .bar > div { height: 100%; background: #43a047; transition: width 0.3s; }
  .section h2 { font-size: 1rem; color: #666; margin: 1.25rem 0 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .chore { display: flex; align-items: center; gap: 1rem; width: 100%; text-align: left; background: #fff; border: 1px solid #e6e6e6; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.5rem; cursor: pointer; font-size: 1rem; }
  .chore:disabled { cursor: default; opacity: 0.6; }
  .chore.due { border-left: 5px solid #e53935; }
  .chore.pending { border-left: 5px solid #fb8c00; }
  .chore.done { border-left: 5px solid #43a047; }
  .chore.not_due { border-left: 5px solid #bdbdbd; opacity: 0.75; }
  .check { flex: none; width: 36px; height: 36px; border-radius: 8px; border: 2px solid #bbb; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #fff; }
  .check.ticked { background: #43a047; border-color: #43a047; }
  .chore-main { flex: 1; min-width: 0; }
  .chore-name { font-weight: 600; color: #222; }
  .chore-meta { font-size: 0.85rem; color: #777; margin-top: 0.15rem; }
  .chore-status { font-size: 0.85rem; color: #555; white-space: nowrap; }
`;

// The open checklist: today only. History, corrections and the chore list
// are on the audit page in the Home Assistant sidebar.
export default function Home() {
  const [busy, setBusy] = useState(false);
  const { data: status, mutate } = useSWR("/api/status", fetcher, { refreshInterval: 60_000 });

  const day: string | undefined = status?.day;
  const chores: Chore[] = status?.chores ?? [];
  const reminders: string[] = status?.reminders ?? [];
  const remindersTitle: string = status?.remindersTitle ?? "";

  // Pick up the new day promptly after midnight.
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 2) mutate();
    }, 30_000);
    return () => clearInterval(id);
  }, [mutate]);

  const tick = async (taskId: number, remove: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (remove) {
        await fetch(`/api/completions?taskId=${taskId}`, { method: "DELETE" });
      } else {
        await fetch("/api/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
      }
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  // What today asks for: everything due, plus whatever was ticked off today.
  const scheduled = chores.filter((c) => c.status.kind === "due" || c.status.doneToday > 0);
  const doneCount = scheduled.filter((c) => c.status.doneToday > 0).length;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f8f9fa", paddingBottom: "2rem" }}>
      <style>{STYLES}</style>

      <div className="header">
        <div className="wrap">
          <div className="title-row">
            <h1>ChoreBot</h1>
            {day && (
              <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "#555" }}>
                {new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="wrap">
        {reminders.length > 0 && (
          <div className="reminders">
            {remindersTitle && <strong>{remindersTitle}</strong>}
            <ol>
              {reminders.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="progress">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>
              {doneCount} / {scheduled.length} done
            </strong>
            {status?.helperName && <span style={{ color: "#777" }}>Helper: {status.helperName}</span>}
          </div>
          <div className="bar">
            <div style={{ width: `${scheduled.length ? (doneCount / scheduled.length) * 100 : 0}%` }} />
          </div>
        </div>

        {SECTIONS.map(({ kind, title }) => {
          const items = chores.filter((c) => c.status.kind === kind);
          if (items.length === 0) return null;
          return (
            <div className="section" key={kind}>
              <h2>
                {title} ({items.length})
              </h2>
              {items.map((c) => (
                <button
                  key={c.id}
                  className={`chore ${kind}`}
                  disabled={busy}
                  onClick={() => tick(c.id, c.status.doneToday > 0)}
                >
                  <span className={`check ${c.status.doneToday > 0 ? "ticked" : ""}`}>
                    {c.status.doneToday > 0 ? "✓" : ""}
                  </span>
                  <span className="chore-main">
                    <div className="chore-name">{c.name}</div>
                    <div className="chore-meta">
                      {c.room} · {c.frequency}
                    </div>
                  </span>
                  <span className="chore-status">
                    {c.status.label}
                    {c.status.doneToday > 1 ? ` · ✓×${c.status.doneToday}` : ""}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
