<script lang="ts">
	import { enhance } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const details = $derived(resultFor(form, 'details'));
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

	.danger-zone {
		border-color: var(--color-danger);
	}
</style>
