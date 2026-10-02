# SimpLMS

A small learning management system that covers the core of Moodle for a demo: users and roles,
course categories, courses, manual enrollments, and a SCORM 1.2 / 2004 player that tracks progress
and resumes where the learner left off.

It's a proof of concept, built to be easy to extend. Choices made where the brief was ambiguous are
recorded in [DECISIONS.md](DECISIONS.md).

## Quick start

Requirements: Node 22.17+, pnpm 10, Docker.

```sh
docker compose up -d     # Postgres 17 on localhost:5432
pnpm install
pnpm db:migrate
pnpm db:seed             # prints the sign-in details
pnpm dev                 # http://localhost:5173
```

No `.env` is needed for local development; every setting has a default. Copy `.env.example` to
`.env` to change anything.

`pnpm db:seed` gives every account a random password and prints them once. To use a known password
instead, run `SEED_PASSWORD=choose-one pnpm db:reset` (this wipes the database and uploaded files,
then migrates and seeds again).

### Seeded data

| Account                                | Site role | Course roles                                    |
| -------------------------------------- | --------- | ----------------------------------------------- |
| `admin@simplms.test`                   | admin     |                                                 |
| `manager@simplms.test`                 | manager   |                                                 |
| `teacher1@simplms.test`                | user      | teaches Workplace Safety, Data Privacy Basics   |
| `teacher2@simplms.test`                | user      | teaches Golf Fundamentals, Product Roadmap 2027 |
| `student1@simplms.test` … `student5@…` | user      | enrolled across the courses                     |

Categories: **Company › Compliance** (nested) and **Product Training**. Four courses, one of them
hidden (Product Roadmap 2027). **Golf Fundamentals** contains Rustici's "Golf Examples" packages in
both SCORM 1.2 and SCORM 2004 (bundled in `fixtures/scorm/`, CC BY 3.0).

### Demo script

1. Sign in as `student1`. The dashboard shows only Golf Fundamentals and Workplace Safety.
2. Start **Golf Explained (SCORM 1.2)**, click **Next** a few times, then **Exit**.
3. Click **Continue**. The package offers to resume and returns to the same page.
4. Page to the end and exit. The activity shows **Completed** and the dashboard progress updates.
5. Repeat with the SCORM 2004 activity.
6. Sign in as `teacher2`. Open Golf Fundamentals › **Report** to see completion, score, time, and
   last access. On **Manage**, upload a package (any zip from `fixtures/scorm/`) and enroll a
   student by email. Visiting `/admin` returns 403.
7. Sign in as `admin` for the admin area: users, categories, and courses.

## Scripts

| Command                | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`             | Dev server on port 5173                                                 |
| `pnpm build`           | Production build (adapter-node) into `build/`                           |
| `pnpm start`           | Run the production build, loading `.env` if present                     |
| `pnpm check`           | `svelte-check` type checking                                            |
| `pnpm lint` / `format` | Prettier and ESLint                                                     |
| `pnpm test`            | Vitest unit tests                                                       |
| `pnpm test:e2e`        | Playwright happy path against a separate, freshly seeded database       |
| `pnpm db:generate`     | Generate a migration from schema changes (drizzle-kit)                  |
| `pnpm db:migrate`      | Apply migrations                                                        |
| `pnpm db:seed`         | Seed demo data (refuses to run twice)                                   |
| `pnpm db:reset`        | Drop everything, migrate, and seed                                      |
| `pnpm db:studio`       | Drizzle Studio                                                          |
| `pnpm auth:generate`   | Regenerate the Better Auth tables in `src/lib/server/db/auth-schema.ts` |

First Playwright run: `pnpm test:e2e:install` downloads Chromium. The e2e run builds the app, creates
a `simplms_e2e` database in the same Postgres container, and serves on port 4173.

## Configuration

All configuration comes from environment variables, validated with Zod at startup
(`src/lib/server/env-schema.ts`, wired into SvelteKit by `src/env.ts`).

| Variable                    | Default                                             | Notes                                                                                               |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | `postgres://simplms:simplms@localhost:5432/simplms` |                                                                                                     |
| `BETTER_AUTH_SECRET`        | a dev-only value                                    | **Required in production**; the server refuses to start with the default. `openssl rand -base64 32` |
| `BETTER_AUTH_URL`           | `http://localhost:5173`                             | Public origin of the app                                                                            |
| `ALLOW_SIGNUP`              | `true`                                              | `false` hides `/sign-up` and rejects sign-ups                                                       |
| `STORAGE_DIR`               | `./storage`                                         | Where extracted SCORM packages live                                                                 |
| `SCORM_MAX_UPLOAD_MB`       | `500`                                               | Largest zip accepted                                                                                |
| `SCORM_MAX_UNCOMPRESSED_MB` | `2000`                                              | Total extracted size, counted while inflating                                                       |
| `SCORM_MAX_FILES`           | `20000`                                             | Files per package                                                                                   |
| `BODY_SIZE_LIMIT`           | adapter-node default (512K)                         | Production only. Set it above the upload limit, e.g. `600M`                                         |

Behind a reverse proxy, also set adapter-node's `PROTOCOL_HEADER` and `HOST_HEADER`.

## Architecture

```
src/
  env.ts                      env var definitions (SvelteKit 3 validates these at startup)
  hooks.server.ts             loads the Better Auth session into locals; mounts /api/auth/*
  lib/
    components/               small shared Svelte components
    scorm/commit-transport.ts browser-side transport for scorm-again commits
    format.ts, forms.ts       client-safe helpers
    server/                   server-only (SvelteKit refuses to bundle it for the browser)
      auth.ts, auth-options.ts  Better Auth instance, admin plugin, site roles
      permissions.ts            every authorization rule (see below)
      db/                       Drizzle schema and all queries, one module per area
      scorm/                    manifest parsing, zip extraction, CMI mapping, upload pipeline
      storage/                  Storage interface + local disk driver
  routes/
    (auth)/sign-in, sign-up   public pages
    (app)/                    signed-in shell: dashboard, courses, admin
    scorm/content/[id]/[...]  serves package files after an access check
    api/scorm/attempts/[id]/commit   SCORM tracking endpoint
```

Route files validate input with Zod, call permission and query functions, and render. They don't
write Drizzle queries or check roles themselves. Every create, update, and delete is a form action,
so the app works without client JavaScript (except the SCORM player, which needs it).

### Permissions

`src/lib/server/permissions.ts` resolves capabilities in two layers: the site role on the user
(admin, manager, user), then the course role from the enrollment (teacher, student). Admins and
managers get every course capability in every course. Capabilities are strings like
`course:edit` or `users:manage`, checked with `can(user, capability, courseId?)` or the route guard
`authorize(event, capability, courseId?)`, which redirects anonymous users to sign in and throws
403 otherwise. `decide()` is the pure rule function and is unit tested against every row of the
permissions table.

To add category-level role assignments later, extend `decide()`'s context with the category chain;
call sites don't change.

### SCORM

- **Upload** (`scorm/upload.ts` → `scorm/import.ts`): the zip is spooled to a temp file, its
  `imsmanifest.xml` is read and validated first, then entries are streamed into storage under
  `scorm/<package id>/`. Paths that escape the folder, symlinks, oversized archives, and missing
  launch files are rejected, and anything already written is removed.
- **Manifest** (`scorm/manifest.ts`): detects 1.2 vs 2004 from `schemaversion` or the ADL
  namespace, resolves the default organization's first launchable item, and applies `xml:base`.
  The parsed manifest is stored as JSON for later multi-SCO or sequencing work.
- **Serving** (`routes/scorm/content/...`): same origin as the app, because SCOs find the API by
  walking `window.parent`. Each request checks `scorm:launch` on the package's course and supports
  HTTP range requests for media.
- **Player** (`courses/[slug]/scorm/[packageId]`): creates `Scorm12API` or `Scorm2004API`
  (scorm-again), loads the saved CMI so the learner resumes, attaches it to `window.API` or
  `window.API_1484_11`, then loads the SCO in an iframe.
- **Tracking** (`api/scorm/attempts/[id]/commit`): stores the full CMI for resume and copies
  completion, success, raw score, and time into columns. SCORM 1.2 `lesson_status` is mapped onto
  2004's completion and success fields so reports treat both versions alike.

### Extending

- **Cloudflare:** server code uses web `Request`/`Response` and the `Storage` interface. Swapping to
  adapter-cloudflare needs an R2 implementation of `Storage`, a Workers-compatible Postgres driver
  (Hyperdrive), and a non-yauzl unzip path (fflate) since Workers have no filesystem.
- **S3/R2 storage:** implement `Storage` (`put`, `head`, `get` with ranges, `deletePrefix`) and
  export it from `storage/index.ts`.
- **SSO, xAPI/cmi5, LTI, gradebook:** each fits as a new module under `lib/server` with its own
  capabilities in `permissions.ts`. Better Auth has SSO plugins; attempts already keep full CMI.

## Dependencies

Runtime dependencies are the ones the brief specified: `better-auth`, `drizzle-orm`, `postgres`,
`zod`, `fast-xml-parser`, `yauzl`, and `scorm-again`. Development additions beyond the scaffold:

- `auth`: the Better Auth CLI (the `@better-auth/cli` package is deprecated), used to generate the
  auth schema.
- `tsx`: runs the TypeScript seed, reset, and e2e-prepare scripts.
- `@types/yauzl`: types for yauzl.

## Testing

- **Unit** (`pnpm test`): permissions table, manifest parser (Golf 1.2 and 2004 fixtures plus edge
  cases), zip import including zip-slip and symlink rejection, CMI time and status mapping, resume
  state, range parsing, progress summaries.
- **End to end** (`pnpm test:e2e`): a student launches the SCORM 1.2 package, exits halfway,
  resumes on the same page, completes it, and the teacher's report shows the completion; a student
  outside the course gets 403 for its SCORM files.
