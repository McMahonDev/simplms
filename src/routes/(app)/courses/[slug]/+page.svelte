<script lang="ts">
	import EmptyState from '#lib/components/EmptyState.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.course.title} · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/courses">Courses</a> › {data.course.categoryName}
	</nav>

	<header class="head">
		<div class="stack title">
			<h1>{data.course.title}</h1>
			{#if !data.course.visible}<span class="badge warning">Hidden from learners</span>{/if}
		</div>
		<div class="cluster">
			{#if data.caps['course:edit']}
				<a class="button secondary" href="/courses/{data.course.slug}/manage">Manage</a>
			{/if}
			{#if data.caps['course:reports:view']}
				<a class="button secondary" href="/courses/{data.course.slug}/report">Report</a>
			{/if}
		</div>
	</header>

	{#if data.course.summary}<p class="summary">{data.course.summary}</p>{/if}

	<section aria-labelledby="activities" class="stack">
		<h2 id="activities">Activities</h2>
		{#if data.activities.length === 0}
			<EmptyState title="No activities yet">
				{#if data.caps['course:edit']}
					<p>
						Upload a SCORM package on the <a href="/courses/{data.course.slug}/manage"
							>manage page</a
						>.
					</p>
				{:else}
					<p>Check back once your teacher has added content.</p>
				{/if}
			</EmptyState>
		{:else}
			<ol class="activities">
				{#each data.activities as a (a.id)}
					<li class="card activity">
						<div class="info">
							<h3>{a.title}</h3>
							<p class="muted meta">
								SCORM {a.version}
								{#if a.attempt?.scoreRaw != null}· Score {a.attempt.scoreRaw}{/if}
							</p>
						</div>
						<StatusBadge attempt={a.attempt} />
						{#if data.caps['scorm:launch']}
							<a class="button" href="/courses/{data.course.slug}/scorm/{a.id}">
								{a.attempt && a.attempt.completionStatus !== 'not attempted' ? 'Continue' : 'Start'}
								<span class="visually-hidden">{a.title}</span>
							</a>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-s);
		justify-content: space-between;
		align-items: start;
	}

	.title {
		gap: var(--space-xs);
		justify-items: start;
	}

	.summary {
		max-width: 65ch;
		white-space: pre-line;
	}

	.activities {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-s);
	}

	.activity {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-s) var(--space-m);
		padding: var(--space-m);

		& .info {
			flex: 1 1 14rem;
		}
	}

	.meta {
		font-size: var(--text-s);
	}
</style>
