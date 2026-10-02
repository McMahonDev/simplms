/**
 * Drizzle schema. Better Auth tables are generated into auth-schema.ts by
 * `pnpm auth:generate`; app tables are defined here.
 *
 * Conventions: UUID primary keys, created_at/updated_at on every table, and explicit
 * on-delete behavior on every foreign key.
 */
import { sql } from 'drizzle-orm';
import {
	type AnyPgColumn,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	boolean
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

export * from './auth-schema.js';

const id = () =>
	uuid('id')
		.default(sql`gen_random_uuid()`)
		.primaryKey();

const timestamps = () => ({
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const category = pgTable(
	'category',
	{
		id: id(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		description: text('description').notNull().default(''),
		// Deleting a parent is blocked while it has children (see db/categories.ts), so
		// "restrict" here is a backstop rather than the primary guard.
		parentId: uuid('parent_id').references((): AnyPgColumn => category.id, {
			onDelete: 'restrict'
		}),
		sortOrder: integer('sort_order').notNull().default(0),
		...timestamps()
	},
	(t) => [index('category_parent_idx').on(t.parentId)]
);

export const course = pgTable(
	'course',
	{
		id: id(),
		// Categories with courses cannot be deleted.
		categoryId: uuid('category_id')
			.notNull()
			.references(() => category.id, { onDelete: 'restrict' }),
		title: text('title').notNull(),
		slug: text('slug').notNull().unique(),
		summary: text('summary').notNull().default(''),
		visible: boolean('visible').notNull().default(true),
		// Keep the course if its creator is deleted.
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps()
	},
	(t) => [index('course_category_idx').on(t.categoryId)]
);

export const enrollmentRole = pgEnum('enrollment_role', ['teacher', 'student']);
export const enrollmentStatus = pgEnum('enrollment_status', ['active', 'suspended']);

export const enrollment = pgTable(
	'enrollment',
	{
		id: id(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		courseId: uuid('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		role: enrollmentRole('role').notNull().default('student'),
		status: enrollmentStatus('status').notNull().default('active'),
		...timestamps()
	},
	(t) => [unique('enrollment_user_course_uq').on(t.userId, t.courseId), index().on(t.courseId)]
);

export const scormVersion = pgEnum('scorm_version', ['1.2', '2004']);

export const scormPackage = pgTable(
	'scorm_package',
	{
		id: id(),
		courseId: uuid('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		version: scormVersion('version').notNull(),
		/** Launch file of the first SCO, relative to the package root. */
		entryHref: text('entry_href').notNull(),
		/** Storage prefix holding the extracted files, e.g. "scorm/<id>". */
		storageKey: text('storage_key').notNull(),
		manifestJson: jsonb('manifest_json').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		...timestamps()
	},
	(t) => [index().on(t.courseId)]
);

/** Normalized across SCORM 1.2 and 2004 so reports treat both alike. */
export type CompletionStatus = 'completed' | 'incomplete' | 'not attempted' | 'unknown';
export type SuccessStatus = 'passed' | 'failed' | 'unknown';

export const scormAttempt = pgTable(
	'scorm_attempt',
	{
		id: id(),
		packageId: uuid('package_id')
			.notNull()
			.references(() => scormPackage.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		attemptNumber: integer('attempt_number').notNull().default(1),
		/** Full CMI runtime state, replayed into scorm-again on relaunch. */
		cmiJson: jsonb('cmi_json').notNull().default({}),
		completionStatus: text('completion_status')
			.$type<CompletionStatus>()
			.notNull()
			.default('not attempted'),
		successStatus: text('success_status').$type<SuccessStatus>().notNull().default('unknown'),
		scoreRaw: doublePrecision('score_raw'),
		/** Accumulated time across all sessions, in seconds. */
		totalTime: doublePrecision('total_time').notNull().default(0),
		/**
		 * The player session that last committed and the session_time it reported.
		 * Autocommits resend the running session_time, so total_time is
		 * (total before this session) + (latest session_time), not a sum of every commit.
		 */
		sessionId: uuid('session_id'),
		sessionTime: doublePrecision('session_time').notNull().default(0),
		lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		unique('scorm_attempt_pkg_user_num_uq').on(t.packageId, t.userId, t.attemptNumber),
		index().on(t.userId)
	]
);

export type User = typeof user.$inferSelect;
export type Category = typeof category.$inferSelect;
export type Course = typeof course.$inferSelect;
export type Enrollment = typeof enrollment.$inferSelect;
export type EnrollmentRole = (typeof enrollmentRole.enumValues)[number];
export type EnrollmentStatus = (typeof enrollmentStatus.enumValues)[number];
export type ScormPackage = typeof scormPackage.$inferSelect;
export type ScormVersion = (typeof scormVersion.enumValues)[number];
export type ScormAttempt = typeof scormAttempt.$inferSelect;
