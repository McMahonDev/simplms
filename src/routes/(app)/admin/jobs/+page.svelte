<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDateTime } from '#lib/format.js';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	function every(minutes: number) {
		if (minutes % 1440 === 0) return minutes === 1440 ? 'Daily' : `Every ${minutes / 1440} days`;
		if (minutes % 60 === 0) return minutes === 60 ? 'Hourly' : `Every ${minutes / 60} hours`;
		return `Every ${minutes} min`;
	}
</script>

<svelte:head><title>Jobs · Admin · SimpLMS</title></svelte:head>

<div class="stack">
	<h1>Scheduled jobs</h1>
	<p class="muted">
		{#if data.scheduler}
			The app server checks for due jobs every minute.
		{:else}
			The in-app scheduler is off (<code>JOBS_SCHEDULER=false</code>). Jobs only run when an
			external cron calls <code>POST /api/jobs/run</code>, or from here.
		{/if}
	</p>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th scope="col">Job</th>
					<th scope="col">Schedule</th>
					<th scope="col">Last run</th>
					<th scope="col">Next run</th>
					<th scope="col"><span class="visually-hidden">Run</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.jobs as job (job.name)}
					{@const ran = resultFor(form, 'run', job.name)}
					<tr>
						<td>
							<div class="name">{job.name}</div>
							<div class="muted small">{job.description}</div>
						</td>
						<td class="nowrap">{every(job.everyMinutes)}</td>
						<td>
							{#if job.running}
								<span class="badge warning">Running</span>
							{:else if job.lastStatus}
								<span class="badge {job.lastStatus === 'ok' ? 'success' : 'danger'}">
									{job.lastStatus === 'ok' ? 'OK' : 'Failed'}
								</span>
								<span class="muted small nowrap">{formatDateTime(job.lastFinishedAt)}</span>
								{#if job.lastResult}<div class="muted small">{job.lastResult}</div>{/if}
							{:else}
								<span class="muted">Never</span>
							{/if}
						</td>
						<td class="nowrap">{formatDateTime(job.nextRunAt)}</td>
						<td class="run">
							<form method="POST" action="?/run" use:enhance>
								<input type="hidden" name="name" value={job.name} />
								<button type="submit" class="secondary small">
									Run now <span class="visually-hidden">{job.name}</span>
								</button>
							</form>
							{#if ran?.message}
								<p class="small {ran.ok ? 'muted' : 'error'}" role="status">{ran.message}</p>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.name {
		font-family: var(--font-mono, monospace);
		font-size: var(--text-s);
	}

	.small {
		font-size: var(--text-xs);
	}

	.nowrap {
		white-space: nowrap;
	}

	.run {
		text-align: right;
		max-width: 16rem;
	}

	.error {
		color: var(--color-danger);
	}
</style>
