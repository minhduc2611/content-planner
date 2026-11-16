import 'dotenv/config';
import express from 'express';
import { prisma } from './db.js';
import { hashPassword, verifyPassword, DUMMY_HASH, newToken, hashToken, tooManyAttempts } from './auth.js';
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
app.use(express.json({ limit: '1mb' })); // room for long rich-text notes (Tiptap JSON is verbose)

// CSRF: browsers can't send a cross-site JSON request without CORS approval (never granted), and cookies are SameSite=Lax
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON only' });
  next();
});

// Comma-separated emails that are always admin (works on hosts where you can't run scripts, e.g. Aiven Runtime)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const promoteIfListed = user => (ADMIN_EMAILS.includes(user.email) && user.role !== 'admin'
  ? prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } }) : user);
const publicUser = u => ({ email: u.email, role: u.role });
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
  const user = await promoteIfListed(await prisma.user.create({ data: { email: c.email, passwordHash: await hashPassword(c.password) } }));
  await startSession(res, user.id);
  res.json(publicUser(user));
});

app.post('/api/login', async (req, res) => {
  const c = readCredentials(req, res);
  if (!c) return;
  const user = await prisma.user.findUnique({ where: { email: c.email } });
  const ok = await verifyPassword(c.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Wrong email or password' });
  await startSession(res, user.id);
  res.json(publicUser(await promoteIfListed(user)));
});

app.post('/api/logout', requireUser, async (req, res) => {
  await prisma.session.delete({ where: { id: req.sessionId } });
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => res.json(publicUser(req.user)));

// Role is read from the DB on every request (requireUser), so promoting/demoting takes effect immediately
const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));

const GUIDE_KINDS = ['format', 'angle'];
const guideFields = b => {
  const { kind, name, description = '', steps = '', examples = '', hooks = '' } = b ?? {};
  if (!GUIDE_KINDS.includes(kind) || !str(name, 200) || !name.trim()) return null;
  if (![description, steps, examples, hooks].every(v => str(v, 20000))) return null;
  // only http(s) links, so a stored "javascript:" link can't run in other users' browsers
  const badLink = examples.split('\n').map(l => l.trim()).filter(Boolean).find(l => !/^https?:\/\//i.test(l));
  if (badLink) return null;
  return { kind, name: name.trim(), description, steps, examples, hooks };
};
const libraryNames = async kind => (await prisma.guide.findMany({ where: { kind }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { name: true } }))
  .map(g => g.name).join('\n');

app.get('/api/guides', requireUser, async (req, res) =>
  res.json(await prisma.guide.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }, { id: 'asc' }] })));

app.post('/api/guides', requireUser, requireAdmin, async (req, res) => {
  const data = guideFields(req.body);
  if (!data) return res.status(400).json({ error: 'Needs kind, a name, and example links starting with http(s)://' });
  if (await prisma.guide.findUnique({ where: { kind_name: { kind: data.kind, name: data.name } } })) return res.status(409).json({ error: 'That name already exists' });
  const position = (await prisma.guide.count({ where: { kind: data.kind } }));
  res.json(await prisma.guide.create({ data: { ...data, position } }));
});

// shortcut: projects store format/angle names, so renaming here doesn't rename them inside existing projects
app.put('/api/guides/:id', requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const data = guideFields(req.body);
  if (!Number.isInteger(id) || !data) return res.status(400).json({ error: 'Needs kind, a name, and example links starting with http(s)://' });
  const clash = await prisma.guide.findUnique({ where: { kind_name: { kind: data.kind, name: data.name } } });
  if (clash && clash.id !== id) return res.status(409).json({ error: 'That name already exists' });
  const r = await prisma.guide.updateMany({ where: { id }, data });
  if (!r.count) return res.status(404).json({ error: 'Not found' });
  res.json(await prisma.guide.findUnique({ where: { id } }));
});

app.delete('/api/guides/:id', requireUser, requireAdmin, async (req, res) => {
  const r = await prisma.guide.deleteMany({ where: { id: Number(req.params.id) || 0 } });
  if (!r.count) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

const projectFields = b => {
  const { name, niche, subs, formats, angles } = b ?? {};
  return [niche, subs, formats, angles].every(v => str(v)) && str(name, 200) && name.trim()
    ? { name: name.trim(), niche, subs, formats, angles } : null;
};

// Authorization: every project route loads the project by id AND owner, so other users' ids just 404
async function ownProject(req, res, next) {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) && await prisma.project.findFirst({ where: { id, userId: req.user.id } });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  req.project = project;
  next();
}

app.get('/api/projects', requireUser, async (req, res) => {
  const where = { userId: req.user.id };
  res.json(await prisma.project.findMany({ where, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }));
});

app.post('/api/projects', requireUser, async (req, res) => {
  const name = req.body?.name;
  if (!str(name, 200) || !name.trim()) return res.status(400).json({ error: 'Project needs a name' });
  const p = await prisma.project.create({ data: { userId: req.user.id, name: name.trim(), niche: '', subs: '', formats: await libraryNames('format'), angles: await libraryNames('angle') }, select: { id: true, name: true } });
  res.json(p);
});

// Note bodies are left out of the list (could be long); noteCount tells the UI which ideas have notes
app.get('/api/projects/:id', requireUser, ownProject, async (req, res) => {
  const contents = await prisma.content.findMany({ where: { projectId: req.project.id }, include: { _count: { select: { notes: true } } } });
  res.json({ ...req.project, contents: contents.map(({ sub, format, angle, done, _count }) => ({ sub, format, angle, done, noteCount: _count.notes })) });
});

app.put('/api/projects/:id', requireUser, ownProject, async (req, res) => {
  const data = projectFields(req.body);
  if (!data) return res.status(400).json({ error: 'name, niche, subs, formats, angles must be text (name not empty)' });
  res.json(await prisma.project.update({ where: { id: req.project.id }, data }));
});

app.delete('/api/projects/:id', requireUser, ownProject, async (req, res) => {
  await prisma.project.delete({ where: { id: req.project.id } }); // cascades to its contents
  res.json({ ok: true });
});

const contentKey = (req, src) => {
  const { sub, format, angle } = src ?? {};
  return [sub, format, angle].every(v => str(v, 500)) ? { projectId: req.project.id, sub, format, angle } : null;
};

app.put('/api/projects/:id/content', requireUser, ownProject, async (req, res) => {
  const where = contentKey(req, req.body);
  const { done } = req.body;
  if (!where || typeof done !== 'boolean') return res.status(400).json({ error: 'bad body' });
  await prisma.content.upsert({ where: { projectId_sub_format_angle: where }, update: { done }, create: { ...where, done } });
  res.json({ ok: true });
});

// Body must be a Tiptap JSON doc; it's only ever rendered by the editor's schema, never as raw HTML
const noteBody = body => {
  if (typeof body !== 'string' || body.length > 200000) return null;
  try { return JSON.parse(body)?.type === 'doc' ? body : null; } catch { return null; }
};
const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

app.get('/api/projects/:id/notes', requireUser, ownProject, async (req, res) => {
  const where = contentKey(req, req.query);
  if (!where) return res.status(400).json({ error: 'sub, format, angle required' });
  const c = await prisma.content.findUnique({ where: { projectId_sub_format_angle: where }, include: { notes: { orderBy: { createdAt: 'desc' } } } });
  res.json(c?.notes ?? []);
});

app.post('/api/projects/:id/notes', requireUser, ownProject, async (req, res) => {
  const where = contentKey(req, req.body);
  if (!where) return res.status(400).json({ error: 'sub, format, angle required' });
  const c = await prisma.content.upsert({ where: { projectId_sub_format_angle: where }, update: {}, create: where });
  res.json(await prisma.note.create({ data: { contentId: c.id, body: EMPTY_DOC } }));
});

// Authorization: the note must belong to an idea inside this user's project
async function ownNote(req, res, next) {
  const note = await prisma.note.findFirst({ where: { id: Number(req.params.noteId) || 0, content: { projectId: req.project.id } } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  req.note = note;
  next();
}

app.put('/api/projects/:id/notes/:noteId', requireUser, ownProject, ownNote, async (req, res) => {
  const body = noteBody(req.body?.body);
  if (!body) return res.status(400).json({ error: 'body must be a Tiptap JSON document' });
  res.json(await prisma.note.update({ where: { id: req.note.id }, data: { body } }));
});

app.delete('/api/projects/:id/notes/:noteId', requireUser, ownProject, ownNote, async (req, res) => {
  await prisma.note.delete({ where: { id: req.note.id } });
  res.json({ ok: true });
});

app.use(express.static('dist')); // built frontend (npm run build)

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
