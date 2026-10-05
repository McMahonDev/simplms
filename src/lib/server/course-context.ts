import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getCourseAccessFacts } from './db/access.js';
import { getCourseBySlug } from './db/courses.js';
import { requireUser } from './guards.js';
import { type Capability, authorize, canSelfEnroll } from './permissions.js';

type CourseEvent = Pick<RequestEvent, 'locals' | 'url' | 'params'>;

/** Loads a course by slug for a signed-in user, without authorizing. 404 when it doesn't exist. */
export async function findCourse(event: CourseEvent) {
	// Anonymous users are sent to sign in before learning whether the course exists.
	const user = requireUser(event);
	const slug = (event.params as { slug?: string }).slug;
	const course = slug ? await getCourseBySlug(slug) : null;
	if (!course) error(404, 'Course not found');
	return { course, user };
}

/**
 * Loads a course by slug and authorizes the user for a capability within it.
 * 404 when the course doesn't exist, sign-in redirect for anonymous, 403 otherwise.
 */
export async function loadCourseFor(event: CourseEvent, capability: Capability) {
	const { course } = await findCourse(event);
	const user = await authorize(event, capability, course.id);
	return { course, user };
}

type JoinableCourse = Awaited<ReturnType<typeof findCourse>>['course'];

/** Throws 403 unless the user may enroll themselves in the course (see canSelfEnroll). */
export async function requireSelfEnroll(userId: string, course: JoinableCourse) {
	const facts = await getCourseAccessFacts(userId, course.id);
	if (!facts || !canSelfEnroll({ course, enrollment: facts.enrollment })) {
		error(403, 'You do not have permission to do that.');
	}
}
