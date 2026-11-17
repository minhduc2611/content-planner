// Single entry point for all server calls. GETs are cached; any write invalidates related GETs.
// Rules live in .claude/skills/api-caching/SKILL.md — keep them in sync.

const TTL_MS = 5 * 60 * 1000; // shortcut: bounds staleness from other tabs/devices/admins; switch to server push if that matters
const AUTH_PATHS = ['/login', '/logout', '/signup'];
const cache = new Map(); // full GET path (with query) -> { at, promise }

const pathOf = key => key.split('?')[0];
const segs = p => p.split('/').filter(Boolean);
// Related = one path is a segment-wise prefix of the other: /projects/5/notes/9 touches /projects, /projects/5, /projects/5/notes?...
const related = (a, b) => {
  const [x, y] = [segs(a), segs(b)].sort((m, n) => m.length - n.length);
  return x.every((s, i) => s === y[i]);
};

export function invalidate(path) {
  if (AUTH_PATHS.includes(pathOf(path))) return cache.clear(); // never show one user's cached data to the next
  for (const key of cache.keys()) if (related(pathOf(key), pathOf(path))) cache.delete(key);
}

async function request(path, body, method) {
  const r = await fetch('/api' + path, body && { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
}

// api(path) = cached GET; api(path, body, method = 'PUT') = write, then invalidate related GETs
export async function api(path, body, method = 'PUT') {
  if (!body) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < TTL_MS) return structuredClone(await hit.promise);
    const promise = request(path);
    cache.set(path, { at: Date.now(), promise }); // shared by concurrent callers
    try { return structuredClone(await promise); } catch (e) { cache.delete(path); throw e; }
  }
  try { return await request(path, body, method); }
  finally { invalidate(path); } // even on failure the server state may have changed
}

export const _cacheKeys = () => [...cache.keys()]; // for tests
