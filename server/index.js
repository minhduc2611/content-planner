import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// Switching databases = swap this adapter + DATABASE_URL (see README)
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
const app = express();
app.use(express.json({ limit: '100kb' }));

const DEFAULTS = {
  niche: 'Building on socials',
  subs: 'Product business optimisation\nProduct development with domain knowledge\nProduct optimisation\nMindset\nLife automation for productivity',
  formats: 'Back-and-forth talk\nTrend\nReaction\nTop list\nGreen screen\nVisual',
  angles: "Tutorial\nComparison\nMyths & common mistakes\nDo's & don'ts (right vs wrong)\nEducational\nTransformation\nChallenge",
};
const PLAN_ID = 1; // shortcut: single plan, no accounts; add users + plan picker if several people/plans are needed
const str = (v, max = 10000) => typeof v === 'string' && v.length <= max;

async function getPlan() {
  return prisma.plan.upsert({
    where: { id: PLAN_ID },
    update: {},
    create: { id: PLAN_ID, ...DEFAULTS },
    include: { done: { select: { sub: true, format: true, angle: true } } },
  });
}

app.get('/api/plan', async (req, res) => res.json(await getPlan()));

app.put('/api/plan', async (req, res) => {
  const { niche, subs, formats, angles } = req.body ?? {};
  if (![niche, subs, formats, angles].every(v => str(v))) return res.status(400).json({ error: 'niche, subs, formats, angles must be strings' });
  await getPlan(); // make sure it exists
  await prisma.plan.update({ where: { id: PLAN_ID }, data: { niche, subs, formats, angles } });
  res.json(await getPlan());
});

// Ticks are keyed by text, so editing inputs never deletes them
app.put('/api/done', async (req, res) => {
  const { sub, format, angle, done } = req.body ?? {};
  if (![sub, format, angle].every(v => str(v, 500)) || typeof done !== 'boolean') return res.status(400).json({ error: 'bad body' });
  await getPlan();
  const where = { planId: PLAN_ID, sub, format, angle };
  if (done) await prisma.done.upsert({ where: { planId_sub_format_angle: where }, update: {}, create: where });
  else await prisma.done.deleteMany({ where });
  res.json({ ok: true });
});

app.use(express.static('dist')); // built frontend (npm run build)

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
