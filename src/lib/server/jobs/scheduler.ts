/**
 * In-process scheduler: checks for due jobs every minute while the app server runs.
 * Started from the `init` server hook when JOBS_SCHEDULER is on. For deployments without a
 * long-lived server, turn it off and call POST /api/jobs/run from an external cron instead.
 */
import { runDueJobs } from './runner.js';

const TICK_MS = 60_000;

// Dev-server reloads re-run init; keep a single timer per process.
const state = globalThis as typeof globalThis & { __simplmsScheduler?: NodeJS.Timeout };

export function startScheduler() {
	if (state.__simplmsScheduler) clearInterval(state.__simplmsScheduler);

	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			for (const r of await runDueJobs()) {
				if (r.status !== 'skipped') console.log(`[jobs] ${r.name}: ${r.status} (${r.result})`);
			}
		} catch (err) {
			console.error('[jobs] tick failed', err);
		} finally {
			running = false;
		}
	};

	state.__simplmsScheduler = setInterval(tick, TICK_MS);
	state.__simplmsScheduler.unref();
	void tick();
}
