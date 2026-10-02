# Decisions

Choices made where the spec was ambiguous or the tooling forced a deviation. Newest at the bottom.

## Tooling

- **SvelteKit 3 instead of `$lib`.** The scaffold installed SvelteKit 3, which removed the `$lib`
  alias in favor of Node subpath imports (`#lib/*`, declared in `package.json`). Everything the spec
  calls `$lib/server/...` lives at `src/lib/server/...` and is imported as `#lib/server/....js`.
  Any `server` directory is still server-only, so the guard the spec relies on still applies.
- **Config lives in `vite.config.ts`.** SvelteKit 3 dropped `svelte.config.js`; the adapter and
  compiler options are passed to the `sveltekit()` Vite plugin.
- **Env validation uses SvelteKit's `src/env.ts`.** SvelteKit 3 validates variables declared with
  `defineEnvVars` at startup using any Standard Schema validator. The Zod schemas live in
  `src/lib/server/env-schema.ts` so scripts that run outside SvelteKit (drizzle-kit, seed) can
  validate `process.env` with the same rules.
- **Every env var has a dev default.** The "done when" checklist requires a fresh clone to run
  without manual steps, so no `.env` is needed locally. In production the server refuses to start
  with the default `BETTER_AUTH_SECRET`.
- **Better Auth CLI is the `auth` package.** `@better-auth/cli` is deprecated; `auth@1.7.x` matches
  `better-auth@1.7.x`. The CLI loads `better-auth.config.ts`, which reuses the shared options in
  `src/lib/server/auth-options.ts` but never touches `$app/*` modules.
- **`pnpm test` runs unit tests only**; Playwright runs with `pnpm test:e2e` so the unit suite
  doesn't need a browser or database.

## Data model

- **Better Auth ids are UUIDs** (`advanced.database.generateId: 'uuid'`) so app tables can use
  `uuid` foreign keys to `user.id`.
- **`scorm_attempt.total_time` is seconds (double precision).** SCORM 1.2 and 2004 use different
  time formats; storing seconds makes accumulation and reporting version-neutral.
- **Status columns are text with TypeScript unions**, enrollment role/status and SCORM version are
  Postgres enums. Statuses are normalized values copied from CMI and may need new values later,
  which is easier with text.
- **Foreign key delete behavior:** deleting a user cascades to their enrollments and attempts and
  sets `course.created_by` to null. Deleting a course cascades to enrollments, packages, and
  attempts. Categories `restrict`: the app blocks deleting a category with courses or children.
