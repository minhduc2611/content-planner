-- CreateTable
CREATE TABLE "Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "niche" TEXT NOT NULL,
    "subs" TEXT NOT NULL,
    "formats" TEXT NOT NULL,
    "angles" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Done" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "sub" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    CONSTRAINT "Done_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Done_planId_sub_format_angle_key" ON "Done"("planId", "sub", "format", "angle");
