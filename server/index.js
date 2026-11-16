import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword, verifyPassword, DUMMY_HASH, newToken, hashToken, tooManyAttempts } from './auth.js';

// node-postgres lets ?sslmode in the URL override our ssl settings, so we read it and pass TLS options ourselves
const dbUrl = new URL(process.env.DATABASE_URL);
const sslmode = dbUrl.searchParams.get('sslmode');
dbUrl.searchParams.delete('sslmode');
let ssl = false;
if (process.env.DATABASE_CA_CERT) ssl = { ca: process.env.DATABASE_CA_CERT }; // encrypted + server identity verified
else if (sslmode && sslmode !== 'disable') {
  console.warn('DATABASE_CA_CERT not set: database traffic is encrypted but the server certificate is not verified');
  ssl = { rejectUnauthorized: false };
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString(), ssl }) });
const app = express();
const PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;

app.set('trust proxy', 1); // behind the host's HTTPS proxy, so req.ip and secure cookies work
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(express.json({ limit: '100kb' }));

// CSRF: browsers can't send a cross-site JSON request without CORS approval (never granted), and cookies are SameSite=Lax
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON only' });
  next();
});

const DEFAULTS = {
  // niche and sub-niches are personal, so each user starts empty; formats/angles are generic starters
  niche: '',
  subs: '',
  formats: 'Back-and-forth talk\nTrend\nReaction\nTop list\nGreen screen\nVisual',
  angles: "Tutorial\nComparison\nMyths & common mistakes\nDo's & don'ts (right vs wrong)\nEducational\nTransformation\nChallenge",
};
const str = (v, max = 10000) => typeof v === 'string' && v.length <= max;
const cookieToken = req => (req.headers.cookie ?? '').split(/;\s*/).find(c => c.startsWith('sid='))?.slice(4);

async function startSession(res, userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }); // tidy up old sessions
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: PROD, expires: expiresAt, path: '/' });
}

async function requireUser(req, res, next) {
  const token = cookieToken(req);
  const session = token && await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return res.status(401).json({ error: 'Please log in' });
  req.user = session.user;
  req.sessionId = session.id;
  next();
}

function readCredentials(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { res.status(400).json({ error: 'Enter a valid email' }); return null; }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) { res.status(400).json({ error: 'Password must be 8–200 characters' }); return null; }
  if (tooManyAttempts(req.ip) || tooManyAttempts(email)) { res.status(429).json({ error: 'Too many attempts, try again in 15 minutes' }); return null; }
  return { email, password };
}

app.post('/api/signup', async (req, res) => {
  const c = readCredentials(req, res);
  if (!c) return;
  if (await prisma.user.findUnique({ where: { email: c.email } })) return res.status(409).json({ error: 'That email is already registered' });
  const user = await prisma.user.create({ data: { email: c.email, passwordHash: await hashPassword(c.password) } });
  await startSession(res, user.id);
  res.json({ email: user.email });
});

app.post('/api/login', async (req, res) => {
  const c = readCredentials(req, res);
  if (!c) return;
  const user = await prisma.user.findUnique({ where: { email: c.email } });
  const ok = await verifyPassword(c.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Wrong email or password' });
  await startSession(res, user.id);
  res.json({ email: user.email });
});

app.post('/api/logout', requireUser, async (req, res) => {
  await prisma.session.delete({ where: { id: req.sessionId } });
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => res.json({ email: req.user.email }));

const getPlan = userId => prisma.plan.upsert({
  where: { userId },
  update: {},
  create: { userId, ...DEFAULTS },
  include: { done: { select: { sub: true, format: true, angle: true } } },
});

app.get('/api/plan', requireUser, async (req, res) => res.json(await getPlan(req.user.id)));

app.put('/api/plan', requireUser, async (req, res) => {
  const { niche, subs, formats, angles } = req.body ?? {};
  if (![niche, subs, formats, angles].every(v => str(v))) return res.status(400).json({ error: 'niche, subs, formats, angles must be strings' });
  await getPlan(req.user.id); // make sure it exists
  await prisma.plan.update({ where: { userId: req.user.id }, data: { niche, subs, formats, angles } });
  res.json(await getPlan(req.user.id));
});

// Ticks are keyed by text, so editing inputs never deletes them
app.put('/api/done', requireUser, async (req, res) => {
  const { sub, format, angle, done } = req.body ?? {};
  if (![sub, format, angle].every(v => str(v, 500)) || typeof done !== 'boolean') return res.status(400).json({ error: 'bad body' });
  const plan = await getPlan(req.user.id);
  const where = { planId: plan.id, sub, format, angle };
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
