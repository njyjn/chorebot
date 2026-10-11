-- AlterTable
ALTER TABLE "Completion" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Completion" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Completion" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'kiosk';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "archivedAt" DATETIME;
