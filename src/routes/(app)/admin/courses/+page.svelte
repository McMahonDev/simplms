<script lang="ts">
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const created = $derived(resultFor(form, 'create'));
	const filtered = $derived(
		Boolean(data.filters.q || data.filters.category || data.filters.visibility)
	);
</script>

<svelte:head><title>Courses · Admin · SimpLMS</title></svelte:head>

<div class="stack">
	<h1>Courses</h1>

	{#if data.adminCaps['courses:create']}
		<details class="card" open={created ? true : undefined}>
			<summary>New course</summary>
			{#if data.categories.length === 0}
				<p class="muted">Create a <a href="/admin/categories">category</a> first.</p>
			{:else}
				<form method="POST" action="?/create" class="grid-form">
					{#if created?.message}
						<p class="alert error wide" role="alert">{created.message}</p>
					{/if}
					<label>
						Title
						<input name="title" required maxlength="200" value={created?.values?.title ?? ''} />
						<FieldError errors={created?.errors?.title} />
					</label>
					<label>
						Slug <span class="muted">(optional)</span>
						<input name="slug" maxlength="80" value={created?.values?.slug ?? ''} />
						<FieldError errors={created?.errors?.slug} />
					</label>
					<label>
						Category
						<select name="categoryId" required>
							{#each data.categories as c (c.id)}
								<option value={c.id} selected={created?.values?.categoryId === c.id}>
									{'— '.repeat(c.depth)}{c.name}
								</option>
							{/each}
						</select>
						<FieldError errors={created?.errors?.categoryId} />
					</label>
					<label class="checkbox">
						<input type="checkbox" name="visible" checked />
						Visible to learners
					</label>
					<label class="wide">
						Summary
						<textarea name="summary" rows="3">{created?.values?.summary ?? ''}</textarea>
					</label>
					<div class="wide"><button type="submit">Create course</button></div>
				</form>
			{/if}
		</details>
	{/if}

	<form method="GET" class="filters" role="search" aria-label="Filter courses">
		<label>
			Search
			<input type="search" name="q" value={data.filters.q ?? ''} placeholder="Title or slug" />
		</label>
		<label>
			Category
			<select name="category">
				<option value="">All categories</option>
				{#each data.categories as c (c.id)}
					<option value={c.id} selected={data.filters.category === c.id}>
						{'— '.repeat(c.depth)}{c.name}
					</option>
				{/each}
			</select>
		</label>
		<label>
			Visibility
			<select name="visibility">
				<option value="">Any</option>
				<option value="visible" selected={data.filters.visibility === 'visible'}>Visible</option>
				<option value="hidden" selected={data.filters.visibility === 'hidden'}>Hidden</option>
			</select>
		</label>
		<div class="cluster">
			<button type="submit" class="secondary">Filter</button>
			{#if filtered}<a href="/admin/courses">Clear</a>{/if}
		</div>
	</form>

	{#if data.courses.length === 0}
		<EmptyState title={filtered ? 'No courses match these filters' : 'No courses yet'} />
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Course</th>
						<th scope="col">Category</th>
						<th scope="col">Students</th>
						<th scope="col">Activities</th>
						<th scope="col">Visibility</th>
						<th scope="col"><span class="visually-hidden">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.courses as c (c.id)}
						<tr>
							<td><a href="/courses/{c.slug}">{c.title}</a></td>
							<td>{c.categoryName}</td>
							<td>{c.students}</td>
							<td>{c.packages}</td>
							<td>
								<span class="badge {c.visible ? 'success' : 'warning'}">
									{c.visible ? 'Visible' : 'Hidden'}
								</span>
							</td>
							<td class="actions">
								<a class="button secondary small" href="/courses/{c.slug}/manage">Manage</a>
								<a class="button secondary small" href="/courses/{c.slug}/report">Report</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	summary {
		cursor: pointer;
		font-weight: 600;
	}

	.grid-form {
		display: grid;
		gap: var(--space-s);
		margin-block-start: var(--space-s);
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

	.filters {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		align-items: end;
	}

	.actions {
		text-align: right;
		white-space: nowrap;

		& .button + .button {
			margin-inline-start: var(--space-2xs);
		}
	}
</style>
