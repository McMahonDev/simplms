/**
 * Every authorization rule in the app lives here.
 *
 * Permissions resolve in two layers:
 *   1. the site role on the user (admin, manager, user), then
 *   2. the course role from the user's enrollment (teacher, student).
 * A site admin or manager can do everything a course teacher can, in every course.
 *
 * Capabilities are plain strings so this can grow toward Moodle-style capabilities and
 * category-level role assignments without changing call sites.
 *
 * Routes call `authorize()` (throws 403 / redirects to sign-in) or `can()` (boolean).
 * UI hiding is a convenience; these checks are the guard.
 */
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SiteRole } from './auth-options.js';
import type { SessionUser } from './auth.js';
import { getCourseAccessFacts } from './db/access.js';
import type { EnrollmentMethod, EnrollmentRole, EnrollmentStatus } from './db/schema.js';
import { requireUser } from './guards.js';

/** Capabilities that apply to the whole site. */
export const SITE_CAPABILITIES = [
	'admin:access',
	'users:view',
	'users:manage',
	'categories:manage',
	'courses:create'
] as const;

/** Capabilities that apply within one course. */
export const COURSE_CAPABILITIES = [
	'course:view',
	'course:edit',
	'course:delete',
	'course:enrollments:manage',
	'course:reports:view',
	'scorm:launch'
] as const;

export type SiteCapability = (typeof SITE_CAPABILITIES)[number];
export type CourseCapability = (typeof COURSE_CAPABILITIES)[number];
export type Capability = SiteCapability | CourseCapability;

const SITE_GRANTS: Record<SiteRole, ReadonlySet<Capability>> = {
	admin: new Set([...SITE_CAPABILITIES, ...COURSE_CAPABILITIES]),
	manager: new Set<Capability>([
		...SITE_CAPABILITIES.filter((c) => c !== 'users:manage'),
		...COURSE_CAPABILITIES
	]),
	user: new Set()
};

const COURSE_GRANTS: Record<EnrollmentRole, ReadonlySet<CourseCapability>> = {
	teacher: new Set([
		'course:view',
		'course:edit',
		'course:enrollments:manage',
		'course:reports:view',
		'scorm:launch'
	]),
	student: new Set(['course:view', 'scorm:launch'])
};

export interface AccessContext {
	siteRole: SiteRole;
	/** Present when the capability is checked against a specific course. */
	course?: { visible: boolean } | null;
	enrollment?: { role: EnrollmentRole; status: EnrollmentStatus } | null;
}

export function isCourseCapability(capability: Capability): capability is CourseCapability {
	return (COURSE_CAPABILITIES as readonly string[]).includes(capability);
}

/**
 * Normalizes Better Auth's role field. The admin plugin stores roles as a comma-separated
 * string; we take the most privileged one and treat anything unknown as "user".
 */
export function siteRoleOf(user: { role?: string | null }): SiteRole {
	const roles = (user.role ?? '').split(',').map((r) => r.trim());
	if (roles.includes('admin')) return 'admin';
	if (roles.includes('manager')) return 'manager';
	return 'user';
}

/** Pure decision function: no I/O, so every rule is unit-testable. */
export function decide(capability: Capability, ctx: AccessContext): boolean {
	if (SITE_GRANTS[ctx.siteRole].has(capability)) return true;
	if (!isCourseCapability(capability)) return false;

	const { course, enrollment } = ctx;
	if (!course || !enrollment || enrollment.status !== 'active') return false;
	if (!COURSE_GRANTS[enrollment.role].has(capability)) return false;

	// Hidden courses are only reachable by admins, managers, and the course's teachers.
	if (!course.visible && enrollment.role !== 'teacher') return false;
	return true;
}

/**
 * Whether a user may join a course by themselves (as a student). Only visible courses with an
 * open or key method qualify, and only for people with no enrollment at all, so a suspended
 * learner can't rejoin on their own. The key itself is checked by the join action.
 */
export function canSelfEnroll(ctx: {
	course: { visible: boolean; enrollmentMethod: EnrollmentMethod };
	enrollment: { role: EnrollmentRole; status: EnrollmentStatus } | null;
}): boolean {
	return ctx.course.visible && ctx.course.enrollmentMethod !== 'manual' && !ctx.enrollment;
}

type UserLike = Pick<SessionUser, 'id'> & { role?: string | null };

/**
 * Checks a capability for a user, optionally within a course.
 * Course capabilities without a courseId only pass for site roles that grant them.
 */
export async function can(
	user: UserLike | null,
	capability: Capability,
	courseId?: string
): Promise<boolean> {
	if (!user) return false;
	const siteRole = siteRoleOf(user);

	// Skip the database when the site role already decides.
	if (SITE_GRANTS[siteRole].has(capability)) return true;
	if (!isCourseCapability(capability) || !courseId) return false;

	const facts = await getCourseAccessFacts(user.id, courseId);
	if (!facts) return false;
	return decide(capability, { siteRole, ...facts });
}

/** Resolves several capabilities at once, for passing to the UI. */
export async function capabilitiesFor<C extends Capability>(
	user: UserLike | null,
	capabilities: readonly C[],
	courseId?: string
): Promise<Record<C, boolean>> {
	if (!user) return Object.fromEntries(capabilities.map((c) => [c, false])) as Record<C, boolean>;

	const siteRole = siteRoleOf(user);
	const needsFacts = courseId && capabilities.some((c) => !SITE_GRANTS[siteRole].has(c));
	const facts = needsFacts ? await getCourseAccessFacts(user.id, courseId) : null;

	return Object.fromEntries(
		capabilities.map((c) => [c, decide(c, { siteRole, ...(facts ?? {}) })])
	) as Record<C, boolean>;
}

/**
 * Route guard: redirects anonymous users to sign in, throws 403 when the signed-in
 * user lacks the capability, and returns the user otherwise.
 */
export async function authorize(
	event: Pick<RequestEvent, 'locals' | 'url'>,
	capability: Capability,
	courseId?: string
): Promise<SessionUser> {
	const user = requireUser(event);
	if (!(await can(user, capability, courseId))) {
		error(403, 'You do not have permission to do that.');
	}
	return user;
}
