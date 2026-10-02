<script lang="ts">
	import EmptyState from '#lib/components/EmptyState.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Dashboard · SimpLMS</title></svelte:head>

<div class="stack dashboard">
	<h1>Welcome back, {data.user.name.split(' ')[0]}</h1>

	<section aria-labelledby="my-courses" class="stack">
		<h2 id="my-courses">My courses</h2>
		{#if data.learning.length === 0}
			<EmptyState title="You aren’t enrolled in any courses yet">
				<p><a href="/courses">Browse courses</a> or ask a teacher to enroll you.</p>
			</EmptyState>
		{:else}
			<ul class="grid">
				{#each data.learning as c (c.id)}
					{@const p = c.progress}
					<li class="card course">
						<h3><a href="/courses/{c.slug}">{c.title}</a></h3>
						{#if p.total === 0}
							<p class="muted small">No activities yet.</p>
						{:else}
							<div class="progress">
								<progress
									max="100"
									value={p.percent}
									aria-label="Progress in {c.title}"
									aria-valuetext="{p.completed} of {p.total} activities complete"
								></progress>
								<p class="muted small">
									{p.completed} of {p.total} complete · {p.percent}%
								</p>
							</div>
						{/if}
						<div class="actions">
							{#if c.next}
								<a class="button" href="/courses/{c.slug}/scorm/{c.next.id}">
									{p.started ? 'Continue' : 'Start'}
									<span class="visually-hidden">{c.title}</span>
								</a>
								<span class="muted small next">Next: {c.next.title}</span>
							{:else if p.total > 0}
								<span class="badge success">Complete</span>
								<a href="/courses/{c.slug}" class="small">Review</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.teaching.length > 0}
		<section aria-labelledby="teaching" class="stack">
			<h2 id="teaching">Teaching</h2>
			<ul class="grid">
				{#each data.teaching as c (c.id)}
					<li class="card course">
						<h3><a href="/courses/{c.slug}">{c.title}</a></h3>
						<p class="muted small">{c.progress.total} activities</p>
						<div class="actions">
							<a class="button secondary" href="/courses/{c.slug}/manage">Manage</a>
							<a class="button secondary" href="/courses/{c.slug}/report">Report</a>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.dashboard {
		gap: var(--space-xl);
	}

	.grid {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-m);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
	}

	.course {
		display: grid;
		gap: var(--space-s);
		align-content: start;
		container-type: inline-size;

		& h3 a {
			text-decoration: none;
			color: var(--color-text);

			&:hover {
				color: var(--color-primary);
			}
		}
	}

	.progress {
		display: grid;
		gap: var(--space-2xs);
	}

	.small {
		font-size: var(--text-s);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs) var(--space-s);
	}

	.next {
		flex: 1 1 8rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@container (max-width: 18rem) {
		.next {
			display: none;
		}
	}
</style>
