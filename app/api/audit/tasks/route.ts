import { prisma } from "@/lib/prisma";
import { publishSensor } from "@/lib/chores";
import { auditUser, backTo, notFound } from "@/lib/auditRequest";
import { localDay } from "@/lib/schedule";
import { parseTaskInput } from "@/lib/taskInput";

// Chore list management, moved off the open checklist.
export async function POST(request: Request) {
  const user = auditUser(request);
  if (!user) return notFound();

  const form = await request.formData();
  const op = form.get("op");
  const id = Number(form.get("id"));

  if (op === "archive") {
    await prisma.task.update({ where: { id }, data: { archived: true, archivedAt: new Date() } });
  } else {
    const n = form.get("n");
    const parsed = parseTaskInput({
      room: form.get("room"),
      name: form.get("name"),
      cadence: form.get("cadence"),
      timesPer: n,
      intervalDays: n,
    });
    if ("error" in parsed) return backTo(form, parsed.error);

    if (op === "edit") {
      await prisma.task.update({ where: { id }, data: parsed.data });
    } else {
      const last = await prisma.task.aggregate({ _max: { sortOrder: true } });
      await prisma.task.create({ data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    }
  }

  await publishSensor(localDay()).catch((error) => console.error("Sensor update failed:", error));
  return backTo(form);
}
