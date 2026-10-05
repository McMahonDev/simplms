import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { JOBS_SCHEDULER } from '$app/env/private';
import { jobs, listJobs, runJob } from '#lib/server/jobs/index.js';
import { authorize } from '#lib/server/permissions.js';
import { formError, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await authorize(event, 'jobs:manage');
	return { jobs: await listJobs(), scheduler: JOBS_SCHEDULER };
};

const runSchema = z.object({ name: z.string().min(1).max(100) });

export const actions: Actions = {
	run: async (event) => {
		await authorize(event, 'jobs:manage');
		const parsed = parseForm(runSchema, await event.request.formData());
		const job = parsed.ok ? jobs.find((j) => j.name === parsed.data.name) : undefined;
		if (!job) error(404, 'Unknown job');

		const result = await runJob(job, { force: true });
		if (result.status === 'skipped') {
			return fail(409, { action: 'run', id: job.name, ...formError('It is already running.') });
		}
		return {
			action: 'run',
			id: job.name,
			ok: result.status === 'ok',
			message: result.status === 'ok' ? `Done: ${result.result}` : `Failed: ${result.result}`
		};
	}
};
