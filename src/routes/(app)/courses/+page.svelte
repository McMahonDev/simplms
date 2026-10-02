<script lang="ts">
	import EmptyState from '#lib/components/EmptyState.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Courses · SimpLMS</title></svelte:head>

<div class="stack">
	<h1>Courses</h1>

	{#if data.groups.length === 0}
		<EmptyState title="No courses are available yet" />
	{/if}

	{#each data.groups as group (group.id)}
		<section aria-labelledby="cat-{group.id}" class="stack">
			<div>
				<h2 id="cat-{group.id}">{group.path}</h2>
				{#if group.description}<p class="muted">{group.description}</p>{/if}
			</div>
			<ul class="grid">
				{#each group.courses as c (c.id)}
					<li class="card course">
						<h3>
							{#if c.canOpen}
								<a href="/courses/{c.slug}">{c.title}</a>
							{:else}
								{c.title}
							{/if}
						</h3>
						<p class="summary">{c.summary}</p>
						<div class="cluster">
							{#if !c.visible}<span class="badge warning">Hidden</span>{/if}
							{#if c.enrollmentRole === 'teacher'}
								<span class="badge">Teaching</span>
							{:else if c.enrollmentStatus === 'active'}
								<span class="badge success">Enrolled</span>
							{:else if c.enrollmentStatus === 'suspended'}
								<span class="badge danger">Suspended</span>
							{:else if !c.canOpen}
								<span class="muted not-enrolled">Not enrolled. Ask a teacher to add you.</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.grid {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-m);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
	}

	.course {
		display: grid;
		gap: var(--space-xs);
		grid-template-rows: auto 1fr auto;
		container-type: inline-size;
	}

	.summary {
		color: var(--color-text-muted);
		font-size: var(--text-s);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.not-enrolled {
		font-size: var(--text-xs);
	}

	h3 a {
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}
</style>
