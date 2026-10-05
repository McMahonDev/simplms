<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const details = $derived(resultFor(form, 'details'));
	const uploaded = $derived(resultFor(form, 'upload'));
	const activityResult = $derived(
		resultFor(form, 'deleteActivity') ??
			resultFor(form, 'moveActivity') ??
			resultFor(form, 'renameActivity')
	);
	let uploading = $state(false);
</script>

<svelte:head><title>Manage {data.course.title} · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/courses/{data.course.slug}">{data.course.title}</a> › Manage
	</nav>
	<h1>Manage course</h1>

	<section class="card stack" aria-labelledby="details-heading">
		<h2 id="details-heading">Details</h2>
		<form method="POST" action="?/details" use:enhance class="grid-form">
			{#if details?.message}
				<p class="alert {details.ok ? 'success' : 'error'} wide" role="status">
					{details.message}
				</p>
			{/if}
			<label>
				Title
				<input name="title" required maxlength="200" value={data.course.title} />
				<FieldError errors={details?.errors?.title} />
			</label>
			<label>
				Slug
				<input name="slug" maxlength="80" value={data.course.slug} />
				<FieldError errors={details?.errors?.slug} />
			</label>
			<label>
				Category
				<select name="categoryId" required>
					{#each data.categories as c (c.id)}
						<option value={c.id} selected={c.id === data.course.categoryId}>
							{'— '.repeat(c.depth)}{c.name}
						</option>
					{/each}
				</select>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="visible" checked={data.course.visible} />
				Visible to learners
			</label>
			<label class="wide">
				Summary
				<textarea name="summary" rows="4">{data.course.summary}</textarea>
			</label>
			<div class="wide"><button type="submit">Save details</button></div>
		</form>
	</section>

	<section class="card stack" aria-labelledby="activities-heading">
		<h2 id="activities-heading">SCORM activities</h2>

		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			class="upload-form"
			use:enhance={() => {
				uploading = true;
				return async ({ update }) => {
					await update();
					uploading = false;
				};
			}}
		>
			<label>
				Package (.zip, SCORM 1.2 or 2004, up to {data.maxUploadMb} MB)
				<input type="file" name="package" accept=".zip,application/zip" required />
			</label>
			<label>
				Title <span class="muted">(optional, defaults to the manifest title)</span>
				<input name="title" maxlength="200" />
			</label>
			<div>
				<button type="submit" disabled={uploading} aria-busy={uploading}>
					{uploading ? 'Uploading…' : 'Upload package'}
				</button>
			</div>
		</form>
		{#if uploaded?.message}
			<p class="alert {uploaded.ok ? 'success' : 'error'}" role={uploaded.ok ? 'status' : 'alert'}>
				{uploaded.message}
			</p>
		{/if}
		{#if activityResult?.message}
			<p class="alert {activityResult.ok ? 'success' : 'error'}" role="status">
				{activityResult.message}
			</p>
		{/if}

		{#if data.activities.length === 0}
			<EmptyState title="No activities yet">
				<p>Upload a SCORM package to give learners something to launch.</p>
			</EmptyState>
		{:else}
			<ol class="activities">
				{#each data.activities as p, i (p.id)}
					{@const settings = resultFor(form, 'activitySettings', p.id)}
					<li class="activity">
						<div class="activity-head">
							<span class="order" aria-hidden="true">{i + 1}</span>
							<div class="activity-title">
								<a href="/courses/{data.course.slug}/activities/{p.id}">{p.title}</a>
								<span class="badge">SCORM {p.version}</span>
								<span class="muted rules">
									{p.criteria}{#if p.maxAttempts}
										· {p.maxAttempts} attempt{p.maxAttempts === 1
											? ''
											: 's'}{/if}{#if p.requiresTitles.length > 0}
										· Locked until {p.requiresTitles.join(', ')}{/if}
								</span>
							</div>
							<div class="cluster">
								<form method="POST" action="?/moveActivity" use:enhance>
									<input type="hidden" name="activityId" value={p.id} />
									<input type="hidden" name="direction" value="up" />
									<button type="submit" class="secondary small" disabled={i === 0}>
										↑<span class="visually-hidden">Move {p.title} up</span>
									</button>
								</form>
								<form method="POST" action="?/moveActivity" use:enhance>
									<input type="hidden" name="activityId" value={p.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										class="secondary small"
										disabled={i === data.activities.length - 1}
									>
										↓<span class="visually-hidden">Move {p.title} down</span>
									</button>
								</form>
							</div>
						</div>
						<details>
							<summary>Settings</summary>
							<div class="activity-edit">
								<form method="POST" action="?/activitySettings" use:enhance class="stack">
									<input type="hidden" name="activityId" value={p.id} />
									<fieldset class="settings">
										<legend>Completion</legend>
										<label>
											Complete when the learner
											<select name="completionRule">
												<option value="viewed" selected={p.completionRule === 'viewed'}
													>opens it</option
												>
												<option value="completed" selected={p.completionRule === 'completed'}
													>completes or passes it</option
												>
												<option value="passed" selected={p.completionRule === 'passed'}
													>passes it</option
												>
											</select>
										</label>
										<label class="passing">
											Passing score
											<input
												name="completionMinScore"
												type="number"
												min="0"
												max="1000"
												step="any"
												inputmode="decimal"
												placeholder="Package's own"
												value={p.completionMinScore ?? ''}
											/>
											<span class="muted hint"
												>Raw score, usually 0–100. Blank uses the package's own pass mark.</span
											>
										</label>
									</fieldset>
									<fieldset class="settings">
										<legend>Attempts</legend>
										<label>
											Attempts allowed
											<input
												name="maxAttempts"
												type="number"
												min="1"
												max="100"
												step="1"
												inputmode="numeric"
												placeholder="Unlimited"
												value={p.maxAttempts ?? ''}
											/>
											<span class="muted hint"
												>A finished attempt reopens as review only. Blank for unlimited.</span
											>
										</label>
									</fieldset>
									{#if data.activities.length > 1}
										<fieldset class="settings">
											<legend>Locked until these are complete</legend>
											<div class="prereqs">
												{#each data.activities.filter((o) => o.id !== p.id) as other (other.id)}
													<label class="checkbox">
														<input
															type="checkbox"
															name="requires"
															value={other.id}
															checked={p.requires.includes(other.id)}
														/>
														{other.title}
													</label>
												{/each}
											</div>
										</fieldset>
									{/if}
									<div class="cluster">
										<button type="submit" class="secondary small">Save settings</button>
										{#if settings?.message}
											<span
												class={settings.ok ? 'badge success' : 'alert error'}
												role={settings.ok ? 'status' : 'alert'}>{settings.message}</span
											>
										{/if}
									</div>
								</form>
								<hr />
								<form method="POST" action="?/renameActivity" use:enhance class="cluster">
									<input type="hidden" name="activityId" value={p.id} />
									<label class="grow">
										<span class="visually-hidden">Title for {p.title}</span>
										<input name="title" required maxlength="200" value={p.title} />
									</label>
									<button type="submit" class="secondary small">Rename</button>
								</form>
								<form method="POST" action="?/deleteActivity" class="cluster">
									<input type="hidden" name="activityId" value={p.id} />
									<label class="checkbox">
										<input type="checkbox" required />
										Also deletes learner progress
									</label>
									<button type="submit" class="danger small">Delete</button>
								</form>
							</div>
						</details>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	{#if data.caps['course:enrollments:manage']}
		<section class="card stack" aria-labelledby="enrollments-heading">
			<h2 id="enrollments-heading">Enrollments</h2>
			<p>
				Add, suspend, and remove learners and teachers on the
				<a href="/courses/{data.course.slug}/enrollments">enrollments page</a>.
			</p>
		</section>
	{/if}

	{#if data.caps['course:delete']}
		<section class="card stack danger-zone" aria-labelledby="delete-heading">
			<h2 id="delete-heading">Delete course</h2>
			<p class="muted">
				Removes the course, its enrollments, SCORM activities, and all learner progress. This cannot
				be undone.
			</p>
			<form method="POST" action="?/delete" class="cluster">
				<label class="checkbox">
					<input type="checkbox" name="confirm" required />
					I understand this deletes all learner progress
				</label>
				<button type="submit" class="danger">Delete course</button>
			</form>
		</section>
	{/if}
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	.grid-form {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));

		& .wide {
			grid-column: 1 / -1;
		}
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		align-self: end;
		padding-block-end: var(--space-xs);
	}

	.upload-form {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		align-items: end;

		& input[type='file'] {
			padding: var(--space-xs) 0;
		}
	}

	.activities {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}

	.activity {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-s);
		padding: var(--space-s);
		display: grid;
		gap: var(--space-xs);

		& summary {
			cursor: pointer;
			font-size: var(--text-s);
			color: var(--color-text-muted);
		}
	}

	.activity-head {
		display: flex;
		align-items: center;
		gap: var(--space-s);
		flex-wrap: wrap;
	}

	.order {
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: var(--color-surface-2);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.activity-title {
		flex: 1 1 12rem;
		display: flex;
		gap: var(--space-xs);
		align-items: center;
		flex-wrap: wrap;
	}

	.activity-edit {
		display: grid;
		gap: var(--space-s);
		padding-block-start: var(--space-s);
	}

	.rules {
		flex-basis: 100%;
		font-size: var(--text-xs);
	}

	.settings {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-s);
		padding: var(--space-s);
		margin: 0;
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		align-items: end;

		& legend {
			font-size: var(--text-s);
			font-weight: 600;
			padding-inline: var(--space-2xs);
		}
	}

	/* The passing score only applies to "passes it"; :has() keeps this working without JS. */
	.passing {
		display: none;
	}

	.settings:has(option[value='passed']:checked) .passing {
		display: grid;
	}

	.hint {
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.prereqs {
		display: grid;
		gap: var(--space-2xs);
		grid-column: 1 / -1;
	}

	hr {
		border: 0;
		border-top: 1px solid var(--color-border);
		width: 100%;
		margin: 0;
	}

	.grow {
		flex: 1 1 14rem;
	}

	.danger-zone {
		border-color: var(--color-danger);
	}
</style>
