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
  what exists, but only enrolled users (and staff) can open one.
- **Enrollment methods** are set per course on its Enrollments page: _assigned only_ (the
  default; staff add people), _open_ (anyone signed in can join), or _enrollment code_ (join by
  typing a code the teacher shares). Joining always creates a normal student enrollment, so
  self-enrolled learners appear in reports and can be suspended like anyone else. People with
  any enrollment, including a suspended one, can't rejoin by themselves, and hidden courses
  can't be joined.
- **Enrollment codes are stored in plain text** so teachers can see and share them, like Moodle.
  They're excluded from the course query every page uses and only read by the Enrollments page
  and the join check, which compares in constant time. Wrong guesses aren't rate limited yet.
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
- **Learners reopen their latest attempt.** An unfinished attempt resumes with its stored CMI;
  `cmi.entry` is `resume` only when the last exit was `suspend`. A finished attempt (completed,
  passed, or failed) reopens in review mode (`lesson_mode`/`mode` = `review`, `credit` =
  `no-credit`), and the commit endpoint ignores commits from any session after the one that
  finished it, so a reviewed quiz can't overwrite the result. Retaking means starting a new
  attempt, up to the activity's limit (Moodle works the same way).
- **SCORM 1.2 `failed` maps to completed/failed** (as Rustici's SCORM Engine does), so a learner
  who finished the assessment shows as complete in reports, with the failure visible.
- **Session-aware time accumulation.** Each player page load gets a session id passed on the
  commit URL. Autocommits resend the running `session_time`, so the attempt stores
  `session_id`/`session_time` and computes `total_time = previous sessions + current session`.
- **Exit unloads the SCO by navigating its frame to about:blank** so it gets a normal
  `beforeunload`/`unload` and can set `exit=suspend` and call LMSFinish/Terminate. If it doesn't,
  the player commits and finishes on its behalf.
- **Commits are synchronous** (scorm-again's SCORM-compliant default); terminate commits use
  `sendBeacon`, so the endpoint parses the body as text regardless of content type.
- **Custom commit transport.** scorm-again's default service sends the terminate commit with
  `sendBeacon`, which races the page that loads after Exit (the course page could show stale
  status). The player injects an `httpService` that uses synchronous XHR for every commit,
  falling back to `sendBeacon` only when the whole page is closing.
- **Commit endpoint checks Origin/Sec-Fetch-Site.** SvelteKit's CSRF protection covers form
  actions, not `+server.ts` endpoints, and the endpoint must accept `text/plain` beacons.
  Session cookies are `SameSite=Lax` as well, so this is defense in depth.

## Completion and locking

- **Completion is set per activity**: _viewed_ (launched once), _completed_ (the SCO reports
  completed or passed; the default, and the old behavior), or _passed_.
- **A passing score replaces the package's own pass mark.** It's only offered with _passed_.
  When set, pass/fail everywhere (badges, report, completion) comes from the score alone and the
  SCO's `success_status` is ignored; otherwise the SCO's verdict is used. Showing both led to
  "Completed" next to "Failed" when the package's built-in mastery score was higher than the
  teacher's. Scores are the SCO's raw score (`cmi.core.score.raw` / `cmi.score.raw`), usually
  0–100; an attempt with no score has no verdict.
- **Any attempt can complete an activity.** The course page and report show the first attempt
  that met the rule (else the latest), so a worse retake never undoes a pass.
- **Attempt limits are per activity** (blank = unlimited) and checked on the server when a new
  attempt is started. When a learner runs out without completing, a teacher can **grant one more
  attempt** from the report (stored per learner in `attempt_grant`, added on top of the limit).
- **Rules are applied when reading, not stored.** Changing a rule re-grades every learner's
  attempts immediately; nothing is recalculated or migrated. All rules live in
  `src/lib/server/completion.ts`, shared by the course page, dashboard, report, and launch guard.
- **Locking is by prerequisite activities** in the same course. An activity unlocks once every
  prerequisite meets its own completion rule. Saving a prerequisite that would form a loop is
  rejected. Course progress counts every activity, locked or not; "Continue" skips locked ones.
- **Locks are enforced on the server.** The launch page returns 403 for a locked activity, and the
  content route only serves a package's files to people who have an attempt for it, which only
  the launch page creates. Teachers, managers, and admins can preview locked activities.
- **Locking an activity someone already finished** keeps it Completed, but they can't reopen it
  until the new prerequisites are met.
- Not built yet: date-based availability, course-level completion criteria (e.g. "only these
  activities count"), and grade aggregation across attempts.

## Notifications and scheduled jobs

- **Notifications are rows, not deliveries.** `notification` holds one message for one person,
  shown in the app (header count and `/notifications`). Message text lives in typed builders in
  `src/lib/server/notifications.ts`; each delivery channel is a job that records its own state.
- **Email is a delivery job.** `deliver-email` runs every minute and moves each pending
  notification to `sent`, `skipped` (the person turned that type off at
  `/notifications/settings`, or is banned), or, after failed sends retried at 1, 5, 30, and 120
  minutes, `failed`. A row is never emailed twice. Notifications created before email existed
  were marked `skipped` by the migration, so nobody gets a backlog.
- **Mail transports are pluggable** (`src/lib/server/mail`). `MAIL_TRANSPORT=log` (the default)
  prints emails to the server log; `resend` uses Resend's HTTP API. Another provider is one
  `Mailer` implementation. Email is on by default for every type; preferences store opt-outs.
- **Sent today:** a teacher enrolling someone, a teacher granting an extra attempt, and a weekly
  reminder for unfinished courses left idle 7 days. Self-enrollment doesn't notify (the learner
  did it).
- **`dedupe_key`** (unique per user when set) makes repeatable notifications idempotent, e.g.
  one reminder per course per ISO week, even if the job runs twice.
- **Notifying never fails the action.** Call sites ignore notify errors; the enrollment or grant
  still succeeds.
- **Jobs run inside the app server.** The `init` hook starts a one-minute timer
  (`JOBS_SCHEDULER`, on by default). Each job has a row in `job`; a server claims a due job with
  a single `UPDATE … SET locked_until` so several instances never run it twice, and a crashed run
  is retried after the 15-minute lock expires. In `pnpm dev`, restart the dev server after adding
  a job: code reloads don't re-run `init`, so the running timer keeps the old job list. Jobs reuse the app's database module, which reads
  config through SvelteKit, so there's no standalone CLI runner.
- **External cron:** with `JOBS_SCHEDULER=false`, call `POST /api/jobs/run` with
  `Authorization: Bearer $CRON_SECRET` (disabled unless the secret is set). Admins can see last
  runs and run a job now at Admin › Jobs.
- The reminder job loads every active student enrollment in one pass, which is fine for a demo
  but should be batched by course for large sites.

## Users

- **User management goes through Better Auth's admin API** (`createUser`, `setRole`, `banUser`),
  after our own `users:manage` check, so both layers agree. Admins can't change their own role
  or ban themselves, which avoids locking the last admin out.
- **Sign-up creates plain `user` accounts.** Set `ALLOW_SIGNUP=false` to hide `/sign-up`.

## Testing

- **Playwright uses its own database** (`simplms_e2e`, created next to the dev database) and
  storage folder, seeded with a known password, and runs against a production build via
  `vite preview`. The dev database is never touched.
- **One e2e file, two tests:** the student/teacher happy path, plus the cross-course 403 check,
  which is cheap and covers a "done when" item directly.
