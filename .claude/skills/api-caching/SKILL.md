---
name: api-caching
description: How the content-planner frontend caches API reads and invalidates them on writes. Use when adding or changing any API endpoint, any fetch in web/, or any screen that loads or mutates data.
---

# API caching in content-planner

All frontend server calls go through `api()` in `web/api.js`. Never call `fetch` directly from components — it would bypass the cache and its invalidation.

## How it works

- `api(path)` (no body) is a **GET**: cached in memory by its full path including the query string, for 5 minutes. Concurrent identical GETs share one request. Failed GETs are not cached. Callers get a copy (`structuredClone`), so mutating results can't corrupt the cache.
- `api(path, body, method)` is a **write** (PUT by default; POST/DELETE need `method`). After it finishes — success or failure — every cached GET whose path is *related* to the write path is dropped.
- **Related** means one path is a segment-wise prefix of the other (query strings ignored). Writing `/projects/5/notes/9` drops `/projects`, `/projects/5`, `/projects/5/notes?…`; it keeps `/projects/6` and `/guides`.
- `/login`, `/logout`, `/signup` clear the whole cache so one account never sees another's data.

## Rules when adding endpoints

1. **Nest paths by ownership** (`/projects/:id/notes/:noteId`, not `/notes/:noteId`). Invalidation relies on the path hierarchy; a flat path would leave the parent's cached list stale.
2. **A GET that embeds data from another resource must sit on that resource's path or a parent of it.** Example: `/projects/:id` returns `noteCount`, and note writes live under `/projects/:id/notes…`, so they invalidate it.
3. If a write affects data outside its own path tree, call `invalidate('/that/path')` from `web/api.js` after the write.
4. New auth/session endpoints must be added to `AUTH_PATHS` in `web/api.js`.
5. Components that keep their own copy in state (e.g. the notes drawer) should update that state from the write's response; the cache only affects the next load.
6. Add or update a case in `web/api.test.js` when changing invalidation behaviour, and run `npm test`.

## Limits

The cache is per browser tab and in memory only (cleared on refresh). Changes made in another tab, device or by an admin show up after refresh or after the 5-minute TTL.
