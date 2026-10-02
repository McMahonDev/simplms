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

## Courses and enrollments

- **Browsing vs. opening a course.** `/courses` lists every visible course so learners can see
  what exists, but only enrolled users (and staff) can open one. Others see "Not enrolled. Ask a
  teacher to add you." Self-enrollment is out of scope.
- **Teachers edit all course details**, including category and visibility, because the permission
  table grants them "Edit course details". Only admins and managers can delete a course.
- **Suspended enrollments grant nothing**, for teachers and students alike.
- **Categories** nest to any depth. Moving a category under itself or a descendant is rejected.
  Deleting is blocked while a category has courses or subcategories.

## SCORM

- **Uploads are spooled to a temp file** because yauzl needs random access to read the central
  directory. SvelteKit's `request.formData()` buffers the upload in memory first, which is fine
  for a demo but should become a streaming upload (or direct-to-R2 presigned upload) later.
- **Size limits:** the zip itself (`SCORM_MAX_UPLOAD_MB`), total uncompressed bytes counted while
  inflating (`SCORM_MAX_UNCOMPRESSED_MB`, so lying headers don't help), and file count
  (`SCORM_MAX_FILES`). Symlink entries are rejected.
- **Zip slip is checked twice:** yauzl rejects `..` and absolute names, and `safeEntryPath`
  repeats the check; the storage driver also refuses keys that resolve outside its root.
- **The manifest is validated before anything is written**, and a failed extraction deletes
  whatever was written. The launch file must exist in the zip.
- **Launch resolution** follows the spec, plus two small additions from the CAM: nested items are
  searched depth-first, and `item@parameters` is appended to the launch URL.
- **Same-origin content is a trust decision.** Packages run JavaScript on the app's origin (the
  spec requires same-origin so the SCO can find `window.parent.API`). Only teachers, managers,
  and admins can upload, so that's acceptable for a demo. For production, serve content from a
  separate origin and bridge the API with scorm-again's cross-frame API.
- **The sample packages are committed** under `fixtures/scorm/` (CC BY 3.0, Rustici Software) so
  seeding works offline.
