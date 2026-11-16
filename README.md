# Content Planner

Mixes sub-niches × formats × angles into video ideas. Each user signs up / logs in and has their own plan and ticks.

- Backend: Express + Prisma (`server/`, `prisma/schema.prisma`)
- Frontend: React + Vite (`web/`)
- Database: PostgreSQL, set by `DATABASE_URL` (any provider: Aiven, Supabase, Neon, local Docker)

Security: scrypt password hashes, random session tokens stored only as SHA-256 hashes, httpOnly + SameSite cookies (Secure when `NODE_ENV=production`), JSON-only API (blocks CSRF), login rate limiting, security headers.

## Run locally

```sh
npm install            # also generates the Prisma client
cp .env.example .env
npm run db:local       # starts Postgres in Docker
npm run db:migrate     # create/update tables
npm run dev            # http://localhost:5173
npm test
```

Changing the data model: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name what-changed`, and commit the new folder in `prisma/migrations/`.

## Roles

Every account is `user` by default. Admins can add/edit/delete the formats & angles library (description, steps, hooks, video examples); everyone can read it.

- Make someone admin: add their email to `ADMIN_EMAILS` (works on Aiven), or run `npm run set-role -- someone@example.com admin`
- Remove admin: take them out of `ADMIN_EMAILS` **and** run `npm run set-role -- someone@example.com user`

## Environment variables

| Name | Required | What |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_CA_CERT` | recommended in prod | Contents of the provider's CA cert (Aiven: `ca.pem`). Without it, TLS is encrypted but the server isn't verified |
| `ADMIN_EMAILS` | no | Comma-separated emails that become admin on sign-up/login |
| `PORT` | no | Defaults to 3001 |

## Deploy (Aiven)

The `Dockerfile` builds the app and API into one container. On start it runs `prisma migrate deploy`, then serves on port 3001.

1. Aiven console → create a **PostgreSQL** service (free plan is enough).
2. **Runtime → Deploy application** → GitHub repo, branch `main`, `./Dockerfile`, port **3001** (HTTP).
3. Integrate the PostgreSQL service with the app, exposing the connection string as **`DATABASE_URL`**.
4. Optional but recommended: add `DATABASE_CA_CERT` as a **secret** env var with the contents of the Postgres service's CA certificate.
5. After pushing new commits: **Overview → Actions → Deploy latest commit** (Aiven doesn't auto-deploy).
