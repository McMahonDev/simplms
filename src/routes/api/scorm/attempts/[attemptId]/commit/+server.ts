/**
 * Tracking endpoint for scorm-again's LMS commits.
 *
 * scorm-again POSTs `{ cmi: {...} }` (dataCommitFormat "json") synchronously on
 * LMSCommit/Commit and on autocommit, and via navigator.sendBeacon (text/plain body) on
 * LMSFinish/Terminate. It expects `{ result: true, errorCode: 0 }` back; errorCode 101 is
 * the generic "General Exception" in both SCORM 1.2 and 2004.
 * See https://jcputney.github.io/scorm-again/ (LMS integration) and SCORM 2004 RTE 3.1.7.
 */
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { isFinished } from '#lib/server/completion.js';
import { getAttemptForCommit, saveCommit } from '#lib/server/db/attempts.js';
import { isSameOrigin } from '#lib/server/guards.js';
import { can } from '#lib/server/permissions.js';
import { normalizeCommit } from '#lib/server/scorm/cmi.js';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const commitSchema = z.object({
	cmi: z.record(z.string(), z.unknown())
});

const failure = (status: number) => json({ result: false, errorCode: 101 }, { status });

export const POST: RequestHandler = async ({ params, url, request, locals }) => {
	if (!isSameOrigin(request, url)) return failure(403);
	const user = locals.user;
	if (!user) return failure(401);

	const attemptId = z.uuid().safeParse(params.attemptId);
	const sessionId = z.uuid().safeParse(url.searchParams.get('session'));
	if (!attemptId.success || !sessionId.success) return failure(400);

	const attempt = await getAttemptForCommit(attemptId.data);
	// Only the learner who owns the attempt can write to it.
	if (!attempt || attempt.userId !== user.id) return failure(403);
	// Enrollment may have been suspended since the player opened.
	if (!(await can(user, 'scorm:launch', attempt.courseId))) return failure(403);

	// sendBeacon posts text/plain, so read text and parse JSON ourselves.
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return failure(413);
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return failure(400);
	}
	const parsed = commitSchema.safeParse(body);
	if (!parsed.success) return failure(400);

	// A finished attempt reopened later is in review mode: accept the commit so the SCO carries
	// on, but keep the recorded result. The session that finished it can still commit.
	if (isFinished(attempt) && attempt.sessionId !== sessionId.data) {
		return json({ result: true, errorCode: 0 });
	}

	const { cmi } = parsed.data;
	await saveCommit(attempt.id, sessionId.data, cmi, normalizeCommit(attempt.version, cmi));
	return json({ result: true, errorCode: 0 });
};

export const fallback: RequestHandler = () => error(405, 'Method not allowed');
