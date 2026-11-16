# Content Planner

Mixes sub-niches × formats × angles into video ideas. Ticks ("done") are saved in a database.

- Backend: Express + Prisma (`server/index.js`, `prisma/schema.prisma`)
- Frontend: React + Vite (`web/`)
- Database: SQLite file by default, set by `DATABASE_URL` in `.env`

## Run

```sh
npm install            # also generates the Prisma client
npm run db:migrate     # create/update the database from prisma/migrations
npm run dev            # API on :3001, app on http://localhost:5173
```

Production: `npm run build && npm run db:deploy && npm start` → app + API on `PORT` (default 3001).

Changing the data model: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name what-changed`.

## Moving to a hosted Postgres (Supabase, Neon, ...)

The connection string alone isn't enough: Prisma needs the provider and adapter changed too, once.

1. `npm i @prisma/adapter-pg`
2. `prisma/schema.prisma`: `provider = "postgresql"`
3. `server/index.js`: replace the SQLite adapter with
   `import { PrismaPg } from '@prisma/adapter-pg'` and `new PrismaPg({ connectionString: process.env.DATABASE_URL })`
4. `.env`: `DATABASE_URL="postgresql://..."` (copy it from the provider's dashboard)
5. Delete `prisma/migrations/` (those SQL files are SQLite-specific) and run `npm run db:migrate -- --name init`

Existing SQLite data isn't copied over automatically; export a CSV first if you need it.

## Deploy

Everything (React app + API) runs as one container: `docker build -t content-planner .`
On start it runs `prisma migrate deploy`, then serves on `PORT`.

- Runtime: any container host (Render, Railway, Fly.io, Koyeb, ...). Set env vars `DATABASE_URL` and optionally `PORT`.
- Database: SQLite inside a container is wiped on every redeploy unless the host mounts a disk.
  For real use, create an Aiven for PostgreSQL service, do the "Moving to a hosted Postgres" steps above,
  and paste Aiven's Service URI as `DATABASE_URL` (it already includes `sslmode=require`).
