<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const joined = $derived(resultFor(form, 'join'));
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
			{#if data.caps['course:enrollments:manage']}
				<a class="button secondary" href="/courses/{data.course.slug}/enrollments">Enrollments</a>
			{/if}
			{#if data.caps['course:reports:view']}
				<a class="button secondary" href="/courses/{data.course.slug}/report">Report</a>
			{/if}
		</div>
	</header>

	{#if data.course.summary}<p class="summary">{data.course.summary}</p>{/if}

	{#if data.join}
		<section aria-labelledby="join-heading" class="card stack join">
			<h2 id="join-heading">Join this course</h2>
			{#if data.join.method === 'key'}
				<p>Enter the enrollment code your teacher gave you.</p>
				<form method="POST" action="?/join" use:enhance class="join-form">
					<label>
						Enrollment code
						<input name="key" required maxlength="100" autocomplete="off" />
					</label>
					<button type="submit">Join course</button>
				</form>
			{:else}
				<p>
					This course is open to everyone. Join to start the activities and track your progress.
				</p>
				<form method="POST" action="?/join" use:enhance>
					<button type="submit">Join course</button>
				</form>
			{/if}
			{#if joined?.message}
				<p class="alert error" role="alert">{joined.message}</p>
			{/if}
		</section>
	{:else}
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
						{@const locked = a.lockedBy.length > 0}
						<li class="card activity" class:locked>
							<div class="info">
								<h3>{a.title}</h3>
								<p class="muted meta">
									SCORM {a.version} · To complete: {a.criteria.toLowerCase()}
									{#if a.attempt?.scoreRaw != null}· Score {a.attempt.scoreRaw}{/if}
									{#if a.attemptCount > 0 && (a.attemptsAllowed || a.attemptCount > 1)}
										· Attempt {a.attemptCount}{#if a.attemptsAllowed}&nbsp;of {a.attemptsAllowed}{/if}
									{:else if a.attemptsAllowed}
										· {a.attemptsAllowed} attempt{a.attemptsAllowed === 1 ? '' : 's'} allowed
									{/if}
								</p>
								{#if locked}
									<p class="meta lock">Complete {a.lockedBy.join(', ')} first.</p>
								{/if}
							</div>
							{#if locked && !a.complete}
								<span class="badge">Locked</span>
							{:else}
								<StatusBadge attempt={a.attempt} complete={a.complete} result={a.result} />
							{/if}
							{#if data.caps['scorm:launch'] && (!locked || data.caps['course:edit'])}
								<div class="cluster launch">
									{#if locked}
										<a class="button secondary" href="/courses/{data.course.slug}/scorm/{a.id}">
											Preview <span class="visually-hidden">{a.title}</span>
										</a>
									{:else if a.finished}
										<a class="button secondary" href="/courses/{data.course.slug}/scorm/{a.id}">
											Review <span class="visually-hidden">{a.title}</span>
										</a>
										{#if a.canRetake}
											<form method="POST" action="?/retake">
												<input type="hidden" name="packageId" value={a.id} />
												<button type="submit">
													Start new attempt <span class="visually-hidden">{a.title}</span>
												</button>
											</form>
										{:else if !a.complete}
											<span class="muted meta">No attempts left</span>
										{/if}
									{:else}
										<a class="button" href="/courses/{data.course.slug}/scorm/{a.id}">
											{a.latest && a.latest.completionStatus !== 'not attempted'
												? 'Continue'
												: 'Start'}
											<span class="visually-hidden">{a.title}</span>
										</a>
									{/if}
								</div>
							{/if}
							{#if resultFor(form, 'retake', a.id)?.message}
								<p class="alert error retake-error" role="alert">
									{resultFor(form, 'retake', a.id)?.message}
								</p>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}
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

	.join {
		max-width: 40rem;
	}

	.join-form {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: 1fr;
		align-items: end;

		@media (min-width: 30rem) {
			grid-template-columns: 1fr auto;
		}
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

	.launch {
		flex-wrap: nowrap;
	}

	.retake-error {
		flex-basis: 100%;
	}

	.locked h3 {
		color: var(--color-text-muted);
	}

	.lock {
		color: var(--color-warning);
	}

	.meta {
		font-size: var(--text-s);
	}
</style>
