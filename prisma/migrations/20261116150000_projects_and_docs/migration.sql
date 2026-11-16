-- Plan -> Project (a user can now have many); existing plans keep their data as "My project"
ALTER TABLE "Plan" RENAME TO "Project";
ALTER TABLE "Project" RENAME CONSTRAINT "Plan_pkey" TO "Project_pkey";
ALTER TABLE "Project" RENAME CONSTRAINT "Plan_userId_fkey" TO "Project_userId_fkey";
ALTER SEQUENCE "Plan_id_seq" RENAME TO "Project_id_seq";
DROP INDEX "Plan_userId_key";
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
ALTER TABLE "Project" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'My project';
ALTER TABLE "Project" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "Project" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Done -> Content (adds notes); every existing row was a tick, so done = true for them
ALTER TABLE "Done" RENAME TO "Content";
ALTER TABLE "Content" RENAME CONSTRAINT "Done_pkey" TO "Content_pkey";
ALTER TABLE "Content" RENAME CONSTRAINT "Done_planId_fkey" TO "Content_projectId_fkey";
ALTER SEQUENCE "Done_id_seq" RENAME TO "Content_id_seq";
ALTER TABLE "Content" RENAME COLUMN "planId" TO "projectId";
ALTER INDEX "Done_planId_sub_format_angle_key" RENAME TO "Content_projectId_sub_format_angle_key";
ALTER TABLE "Content" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Content" ALTER COLUMN "done" SET DEFAULT false;
ALTER TABLE "Content" ADD COLUMN "doc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
