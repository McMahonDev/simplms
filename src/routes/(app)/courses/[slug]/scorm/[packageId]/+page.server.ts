import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { loadCourseFor } from '#lib/server/course-context.js';
import { getOrCreateCurrentAttempt, touchAttempt } from '#lib/server/db/attempts.js';
import { getCoursePackage } from '#lib/server/db/packages.js';
import { buildLaunchCmi } from '#lib/server/scorm/cmi.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'scorm:launch');

	const packageId = z.uuid().safeParse(event.params.packageId);
	const pkg = packageId.success ? await getCoursePackage(course.id, packageId.data) : null;
	if (!pkg) error(404, 'Activity not found');

	const attempt = await getOrCreateCurrentAttempt(pkg.id, user.id);
	await touchAttempt(attempt.id);

	// Each page load is one SCORM session; the id lets the commit endpoint accumulate time.
	const sessionId = randomUUID();
	const encodedHref = pkg.entryHref
		.split('/')
		.map((segment, i, all) =>
			// Keep any query string on the last segment intact.
			i === all.length - 1 ? segment : encodeURIComponent(segment)
		)
		.join('/');

	return {
		course: { slug: course.slug, title: course.title },
		activity: { id: pkg.id, title: pkg.title, version: pkg.version },
		launchUrl: `/scorm/content/${pkg.id}/${encodedHref}`,
		commitUrl: `/api/scorm/attempts/${attempt.id}/commit?session=${sessionId}`,
		cmi: buildLaunchCmi(
			pkg.version,
			attempt.cmiJson as Record<string, unknown>,
			attempt.totalTime,
			{ id: user.id, name: user.name }
		)
	};
};
