<script lang="ts">
	import EmptyState from '#lib/components/EmptyState.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { formatDateTime, formatDuration } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const completedCount = $derived(
		data.rows.filter((r) => r.progress.total > 0 && r.progress.completed === r.progress.total)
			.length
	);
</script>

<svelte:head><title>Report · {data.course.title} · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/courses/{data.course.slug}">{data.course.title}</a> › Report
	</nav>
	<h1>Progress report</h1>

	{#if data.rows.length === 0}
		<EmptyState title="No students are enrolled">
			<p>
				Enroll learners on the <a href="/courses/{data.course.slug}/enrollments">enrollments page</a
				>.
			</p>
		</EmptyState>
	{:else}
		<p class="muted">
			{data.rows.length} student{data.rows.length === 1 ? '' : 's'} · {completedCount} completed every
			activity · {data.packages.length} activit{data.packages.length === 1 ? 'y' : 'ies'}
		</p>

		<div class="table-wrap">
			<table>
				<caption class="visually-hidden">
					Learner progress for {data.course.title}
				</caption>
				<thead>
					<tr>
						<th scope="col">Learner</th>
						<th scope="col">Completion</th>
						{#each data.packages as p (p.id)}
							<th scope="col">
								{p.title}
								<span class="muted version">SCORM {p.version}</span>
								<span class="muted version">{p.criteria}</span>
							</th>
						{/each}
						<th scope="col">Time</th>
						<th scope="col">Last access</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.userId)}
						<tr>
							<th scope="row" class="learner">
								<span>{r.name}</span>
								<span class="muted email">{r.email}</span>
								{#if r.status === 'suspended'}<span class="badge danger">Suspended</span>{/if}
							</th>
							<td class="completion">
								{#if r.progress.total > 0}
									<progress
										max="100"
										value={r.progress.percent}
										aria-label="{r.name}: {r.progress.completed} of {r.progress.total} complete"
									></progress>
									<span class="muted">{r.progress.completed}/{r.progress.total}</span>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
							{#each r.cells as cell, i (data.packages[i].id)}
								<td>
									{#if cell.locked && !cell.attempt}
										<span class="badge">Locked</span>
									{:else}
										<StatusBadge
											attempt={cell.attempt}
											complete={cell.complete}
											result={cell.result}
										/>
									{/if}
									{#if cell.attempt?.scoreRaw != null}
										<span class="score">Score {cell.attempt.scoreRaw}</span>
									{/if}
									{#if cell.attemptCount > 1}
										<span class="score">{cell.attemptCount} attempts</span>
									{/if}
								</td>
							{/each}
							<td class="nowrap">{formatDuration(r.totalTime)}</td>
							<td class="nowrap">{formatDateTime(r.lastAccess)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	th .version {
		display: block;
		font-weight: 400;
		font-size: var(--text-xs);
	}

	.learner {
		font-weight: 500;
		background: none;
		color: var(--color-text);

		& > span {
			display: block;
		}
	}

	.email {
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.completion {
		min-width: 8rem;

		& progress {
			width: 5rem;
			vertical-align: middle;
		}
	}

	.score {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
