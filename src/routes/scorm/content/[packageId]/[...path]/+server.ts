/**
 * Serves extracted SCORM package files on the app's own origin.
 *
 * Same-origin is required: a SCO finds the LMS API by walking window.parent looking for
 * `API` (1.2) or `API_1484_11` (2004), which browsers block across origins.
 * See SCORM 1.2 RTE section 3.3.6.1 and SCORM 2004 RTE section 3.1.2.1 ("API discovery").
 */
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { hasAttempt } from '#lib/server/db/attempts.js';
import { getPackage } from '#lib/server/db/packages.js';
import { requireUser } from '#lib/server/guards.js';
import { parseRange } from '#lib/server/http-range.js';
import { can } from '#lib/server/permissions.js';
import { contentTypeFor } from '#lib/server/scorm/mime.js';
import { storage } from '#lib/server/storage/index.js';
import type { RequestHandler } from './$types';

const packageIdSchema = z.uuid();

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);

	const packageId = packageIdSchema.safeParse(event.params.packageId);
	if (!packageId.success) error(404, 'Not found');
	const pkg = await getPackage(packageId.data);
	if (!pkg) error(404, 'Not found');

	// Check course access before touching storage.
	if (!(await can(user, 'scorm:launch', pkg.courseId))) {
		error(403, 'You do not have access to this course.');
	}
	// Files are only served once the launch page (which enforces locks) has opened the package.
	if (!(await hasAttempt(pkg.id, user.id))) {
		error(403, 'Open this activity from its course page first.');
	}

	const relative = event.params.path;
	const segments = relative.split('/');
	if (
		!relative ||
		relative.includes('\\') ||
		relative.includes('\0') ||
		segments.some((s) => s === '' || s === '.' || s === '..')
	) {
		error(404, 'Not found');
	}

	const key = `${pkg.storageKey}/${relative}`;
	const info = await storage.head(key);
	if (!info) error(404, 'Not found');

	const headers = new Headers({
		'Content-Type': contentTypeFor(relative),
		'Accept-Ranges': 'bytes',
		'Last-Modified': info.lastModified.toUTCString(),
		// Package files never change after upload; keep them private to this user's browser.
		'Cache-Control': 'private, max-age=3600',
		'X-Content-Type-Options': 'nosniff'
	});

	const range = parseRange(event.request.headers.get('range'), info.size);
	if (range === 'unsatisfiable') {
		headers.set('Content-Range', `bytes */${info.size}`);
		return new Response(null, { status: 416, headers });
	}

	const body = await storage.get(key, range ?? undefined);
	if (!body) error(404, 'Not found');

	if (range) {
		headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
		headers.set('Content-Length', String(range.end - range.start + 1));
		return new Response(body, { status: 206, headers });
	}
	headers.set('Content-Length', String(info.size));
	return new Response(body, { status: 200, headers });
};
