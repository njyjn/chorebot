import { auditUser, backTo, notFound } from "@/lib/auditRequest";

// Sends the digest now without recording it, via the same loopback-only
// endpoint the alert loop uses.
export async function POST(request: Request) {
  if (!auditUser(request)) return notFound();
  const form = await request.formData();
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.INTERNAL_PORT || 3100}/api/cron?test=1`, {
      method: "POST",
    });
    const json = await res.json();
    const notice = !json.success
      ? "Test alert failed, see the add-on log."
      : json.sent
        ? `Test alert sent with ${json.count} overdue chore${json.count === 1 ? "" : "s"}.`
        : "Nothing is overdue right now, so no alert was sent.";
    return backTo(form, notice);
  } catch (error) {
    console.error("Test alert failed:", error);
    return backTo(form, "Test alert failed, see the add-on log.");
  }
}
