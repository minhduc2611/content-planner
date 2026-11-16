-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Guide" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '',
    "examples" TEXT NOT NULL DEFAULT '',
    "hooks" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_kind_name_key" ON "Guide"("kind", "name");

-- Starter library (admins can edit); names match the old default lists so existing projects link up
INSERT INTO "Guide" ("kind", "name", "description", "steps", "hooks", "position") VALUES
('format', 'Back-and-forth talk', 'Two characters (often both you) argue or chat, cutting between them. Great for showing two sides of a problem.', 'Pick a tension: beginner vs expert, old way vs new way
Write 4–6 short lines per side
Film each side separately, change angle or outfit
Cut fast between them; end with the "winner" line', '"Me explaining X to my past self…"
"POV: your boss asks why the product isn''t selling"', 0),
('format', 'Trend', 'Ride a trending sound, meme or template and bend it to your niche.', 'Find a trend that is rising (check the sound''s video count)
Map the trend''s joke or structure to a niche problem
Keep the original timing; put your twist in on-screen text
Post while it is still rising', 'Use the trend''s own opening line, then your twist in text', 1),
('format', 'Reaction', 'React to someone else''s post, comment or claim, adding your expert take.', 'Pick a post or comment people disagree about
Show it on screen (stitch, duet or screenshot)
Give your take in the first 3 seconds
Back it up with one example or number', '"This is the worst advice I''ve seen this week…"
"Replying to this comment because it''s half right"', 2),
('format', 'Top list', 'A ranked or numbered list: tools, tips, mistakes.', 'Choose a number (3, 5 or 7) and a clear category
Order so the best one is last (keeps people watching)
One line + one visual per item
Ask viewers for their #1 in the caption', '"5 tools I''d pay for again tomorrow"
"Ranking every X from worst to best"', 3),
('format', 'Green screen', 'You talk in front of a screenshot, article, chart or website.', 'Find the background: a post, chart, product page or headline
Point at the exact part you are talking about
Keep it under 45 seconds
End with what the viewer should do next', '"Look at this number… this is why most people fail"
"This headline is missing one important thing"', 4),
('format', 'Visual', 'Mostly visuals: b-roll, screen recordings, text on screen; little or no talking.', 'Plan 5–8 shots that tell the story without sound
Write short on-screen text for each shot
Add a trending or calm sound
First shot must show the result or the problem', 'Open on the final result, then "here''s how"', 5),
('angle', 'Tutorial', 'Teach how to do one specific thing, step by step.', 'Promise one clear result in the hook
Show 3–5 steps, one per cut
Show the finished result
Offer a part 2 or a template', '"How to do X in 60 seconds"
"Steal my exact process for X"', 6),
('angle', 'Comparison', 'Put two options side by side: tools, methods, before/after choices.', 'Pick two options people really choose between
Compare on 3 criteria that matter
Give a clear verdict and who each one is for', '"X vs Y: which one should you use?"
"I tried both for 30 days"', 7),
('angle', 'Myths & common mistakes', 'Bust a popular belief or point out a mistake most people make.', 'State the myth or mistake plainly
Explain why it is wrong (one reason)
Show what to do instead', '"Stop doing X. Here''s why."
"The biggest mistake I see beginners make"', 8),
('angle', 'Do''s & don''ts (right vs wrong)', 'Show the wrong way next to the right way.', 'Show the wrong way first (relatable)
Show the right way with the difference highlighted
Repeat for 2–3 pairs', '"Don''t do this ❌ Do this ✅"
"Wrong vs right way to X"', 9),
('angle', 'Educational', 'Explain a concept or why something works.', 'Start with a surprising fact or question
Explain with one simple example or analogy
Finish with why it matters to the viewer', '"Nobody explains X like this"
"Here''s why X actually works"', 10),
('angle', 'Transformation', 'Before → after: results, progress, a makeover.', 'Show the before (the pain)
Show 2–3 key changes
Reveal the after; mention the timeframe', '"From X to Y in 30 days"
"This is what changed everything"', 11),
('angle', 'Challenge', 'Set a challenge for yourself or invite viewers to join.', 'Define the rules and the timeframe
Show progress or day-by-day updates
Share the result and invite others to try', '"I tried X every day for 7 days"
"Can you do X? Try it and tag me"', 12);
