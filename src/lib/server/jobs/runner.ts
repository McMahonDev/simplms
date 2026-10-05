/**
 * Runs scheduled jobs. Safe with several app servers: a server claims a job by setting
 * locked_until in a single UPDATE, so only one of them runs it. A crashed run's lock expires
 * after LOCK_MINUTES and the job is picked up again.
 */
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { job as jobTable } from '../db/schema.js';
import { jobs } from './registry.js';
import type { Job } from './types.js';

const LOCK_MINUTES = 15;

export type JobRunResult = { name: string; status: 'ok' | 'error' | 'skipped'; result: string };

/**
 * Creates rows for newly registered jobs, due immediately. (The column default is the database's
 * now(), which can be later than the `now` a tick compares against, delaying the first run.)
 */
async function syncJobRows() {
	await db
		.insert(jobTable)
		.values(jobs.map((j) => ({ name: j.name, nextRunAt: new Date(0) })))
		.onConflictDoNothing();
}

/** Claims the job if nobody else holds it (and, unless forced, it's due). */
async function claim(name: string, now: Date, force: boolean) {
	const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
	const [row] = await db
		.update(jobTable)
		.set({ lockedUntil, lastStartedAt: now })
		.where(
			and(
				eq(jobTable.name, name),
				or(isNull(jobTable.lockedUntil), lte(jobTable.lockedUntil, now)),
				force ? undefined : lte(jobTable.nextRunAt, now)
			)
		)
		.returning({ name: jobTable.name });
	return Boolean(row);
}

/** Runs one job if it can be claimed. `force` runs it now even if it isn't due. */
export async function runJob(job: Job, { now = new Date(), force = false } = {}) {
	await syncJobRows();
	if (!(await claim(job.name, now, force))) {
		return { name: job.name, status: 'skipped', result: 'Not due, or already running' } as const;
	}

	let status: 'ok' | 'error' = 'ok';
	let result: string;
	try {
		result = await job.run(now);
	} catch (err) {
		status = 'error';
		result = err instanceof Error ? err.message : String(err);
		console.error(`[jobs] ${job.name} failed`, err);
	}

	const finished = new Date();
	await db
		.update(jobTable)
		.set({
			lockedUntil: null,
			lastFinishedAt: finished,
			lastStatus: status,
			lastResult: result.slice(0, 500),
			// Schedule from the start of the run so the cadence doesn't drift.
			nextRunAt: new Date(now.getTime() + job.everyMinutes * 60_000)
		})
		.where(eq(jobTable.name, job.name));
	return { name: job.name, status, result } satisfies JobRunResult;
}

/** Runs every job that is due. Jobs run one after another so a slow one can't pile up. */
export async function runDueJobs(now = new Date()): Promise<JobRunResult[]> {
	const results: JobRunResult[] = [];
	for (const job of jobs) results.push(await runJob(job, { now }));
	return results;
}

/** Registered jobs with their last run, for the admin page. */
export async function listJobs() {
	await syncJobRows();
	const rows = await db.select().from(jobTable);
	const byName = new Map(rows.map((r) => [r.name, r]));
	const now = Date.now();
	return jobs.map((j) => {
		const row = byName.get(j.name);
		return {
			name: j.name,
			description: j.description,
			everyMinutes: j.everyMinutes,
			nextRunAt: row?.nextRunAt ?? null,
			lastStartedAt: row?.lastStartedAt ?? null,
			lastFinishedAt: row?.lastFinishedAt ?? null,
			lastStatus: row?.lastStatus ?? null,
			lastResult: row?.lastResult ?? null,
			running: Boolean(row?.lockedUntil && row.lockedUntil.getTime() > now)
		};
	});
}
