-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "contentId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_contentId_idx" ON "Note"("contentId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing plain-text notes: each becomes the idea's first note, one Tiptap paragraph per line
INSERT INTO "Note" ("contentId", "body", "createdAt", "updatedAt")
SELECT c."id",
  jsonb_build_object('type', 'doc', 'content', (
    SELECT jsonb_agg(
      CASE WHEN l = '' THEN jsonb_build_object('type', 'paragraph')
      ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', l))) END
      ORDER BY n)
    FROM unnest(string_to_array(c."doc", E'\n')) WITH ORDINALITY AS t(l, n)
  ))::text,
  c."updatedAt", c."updatedAt"
FROM "Content" c
WHERE btrim(c."doc") <> '';

-- AlterTable
ALTER TABLE "Content" DROP COLUMN "doc";
