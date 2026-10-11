import { NextResponse } from "next/server";
import { choresForDay } from "@/lib/chores";
import { getOptions } from "@/lib/config";
import { fail } from "@/lib/http";
import { localDay } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// The open checklist only ever shows today; history lives on the audit page.
export async function GET() {
  try {
    const day = localDay();
    const chores = await choresForDay(day);
    const { helperName, reminders, remindersTitle, alertTime } = getOptions();
    return NextResponse.json({
      success: true,
      day,
      chores,
      helperName,
      reminders,
      remindersTitle,
      alertTime,
    });
  } catch (error) {
    console.error("Error fetching status:", error);
    return fail("Failed to fetch status");
  }
}
