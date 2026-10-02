import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getCourseBySlug } from './db/courses.js';
import { requireUser } from './guards.js';
import { type Capability, authorize } from './permissions.js';

/**
 * Loads a course by slug and authorizes the user for a capability within it.
 * 404 when the course doesn't exist, sign-in redirect for anonymous, 403 otherwise.
 */
export async function loadCourseFor(
	event: Pick<RequestEvent, 'locals' | 'url' | 'params'>,
	capability: Capability
) {
	// Anonymous users are sent to sign in before learning whether the course exists.
	requireUser(event);
	const slug = (event.params as { slug?: string }).slug;
	const course = slug ? await getCourseBySlug(slug) : null;
	if (!course) error(404, 'Course not found');
	const user = await authorize(event, capability, course.id);
	return { course, user };
}
