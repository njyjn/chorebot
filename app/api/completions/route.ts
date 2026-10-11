import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishSensor } from "@/lib/chores";
import { getOptions } from "@/lib/config";
import { fail } from "@/lib/http";
import { localDay } from "@/lib/schedule";

// The open checklist can only tick and untick today. Corrections to other
// days go through the audit page.

const refreshSensor = () =>
  publishSensor(localDay()).catch((error) => console.error("Sensor update failed:", error));

export async function POST(request: Request) {
  try {
    const { taskId } = await request.json();
    const completion = await prisma.completion.create({
      data: {
        taskId: Number(taskId),
        day: localDay(),
        completedBy: getOptions().helperName || null,
        source: "kiosk",
      },
    });
    await refreshSensor();
    return NextResponse.json({ success: true, completion });
  } catch (error) {
    console.error("Error adding completion:", error);
    return fail("Failed to add completion");
  }
}

// Unticks the most recent completion of a task today. The row is kept and
// marked deleted so the audit page can show it.
export async function DELETE(request: Request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get("taskId"));
    const latest = await prisma.completion.findFirst({
      where: { taskId, day: localDay(), deletedAt: null },
      orderBy: { completedAt: "desc" },
    });
    if (!latest) return fail("No completion to remove", 404);

    await prisma.completion.update({
      where: { id: latest.id },
      data: { deletedAt: new Date(), deletedBy: "kiosk" },
    });
    await refreshSensor();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing completion:", error);
    return fail("Failed to remove completion");
  }
}
