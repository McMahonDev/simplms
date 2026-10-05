/**
 * External cron trigger: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/jobs/run`.
 * Runs every due job, or one job with ?job=<name>&force=1. Returns 404 unless CRON_SECRET is set.
 */
import { timingSafeEqual } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { CRON_SECRET } from '$app/env/private';
import { jobs, runDueJobs, runJob } from '#lib/server/jobs/index.js';
import type { RequestHandler } from './$types';

function authorized(header: string | null, secret: string) {
	const given = Buffer.from(header ?? '');
	const expected = Buffer.from(`Bearer ${secret}`);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (!CRON_SECRET) error(404, 'Not found');
	if (!authorized(request.headers.get('authorization'), CRON_SECRET)) error(401, 'Unauthorized');

	const name = url.searchParams.get('job');
	if (!name) return json({ results: await runDueJobs() });

	const job = jobs.find((j) => j.name === name);
	if (!job) error(404, 'Unknown job');
	return json({ results: [await runJob(job, { force: url.searchParams.get('force') === '1' })] });
};

export const fallback: RequestHandler = () => error(405, 'Method not allowed');
