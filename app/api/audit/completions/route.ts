import { prisma } from "@/lib/prisma";
import { publishSensor } from "@/lib/chores";
import { auditUser, backTo, isDay, notFound } from "@/lib/auditRequest";
import { localDay } from "@/lib/schedule";

// Corrections from the week grid: record a chore as done on any past day, or
// untick one. Both are attributed to the signed-in Home Assistant user.
export async function POST(request: Request) {
  const user = auditUser(request);
  if (!user) return notFound();

  const form = await request.formData();
  const taskId = Number(form.get("taskId"));
  const day = form.get("day");
  if (!Number.isInteger(taskId) || !isDay(day) || day > localDay()) {
    return backTo(form, "That correction was not valid.");
  }

  if (form.get("op") === "remove") {
    const latest = await prisma.completion.findFirst({
      where: { taskId, day, deletedAt: null },
      orderBy: { completedAt: "desc" },
    });
    if (latest) {
      await prisma.completion.update({
        where: { id: latest.id },
        data: { deletedAt: new Date(), deletedBy: user },
      });
    }
  } else {
    await prisma.completion.create({ data: { taskId, day, completedBy: user, source: "audit" } });
  }

  await publishSensor(localDay()).catch((error) => console.error("Sensor update failed:", error));
  return backTo(form);
}
