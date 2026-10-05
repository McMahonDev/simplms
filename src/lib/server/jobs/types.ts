export type Job = {
	/** Stable id, stored in the job table. */
	name: string;
	description: string;
	/** How often it runs. The runner checks every minute, so this is a lower bound. */
	everyMinutes: number;
	/** Does the work and returns a one-line summary for the admin page. */
	run(now: Date): Promise<string>;
};
