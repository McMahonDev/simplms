<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Node = (typeof data.tree)[number];

	const created = $derived(resultFor(form, 'create'));
	const deleted = $derived(resultFor(form, 'delete'));
</script>

<svelte:head><title>Categories · Admin · SimpLMS</title></svelte:head>

<div class="stack">
	<h1>Categories</h1>

	{#if deleted?.ok}<p class="alert success" role="status">{deleted.message}</p>{/if}

	<details class="card create" open={created && !created.ok ? true : undefined}>
		<summary>New category</summary>
		<form method="POST" action="?/create" use:enhance class="grid-form">
			{#if created?.message}
				<p class="alert {created.ok ? 'success' : 'error'}" role="status">{created.message}</p>
			{/if}
			<label>
				Name
				<input name="name" required maxlength="120" value={created?.values?.name ?? ''} />
				<FieldError errors={created?.errors?.name} />
			</label>
			<label>
				Slug <span class="muted">(optional)</span>
				<input name="slug" maxlength="80" value={created?.values?.slug ?? ''} />
				<FieldError errors={created?.errors?.slug} />
			</label>
			<label>
				Parent
				<select name="parentId">
					<option value="">None (top level)</option>
					{#each data.options as opt (opt.id)}
						<option value={opt.id}>{'— '.repeat(opt.depth)}{opt.name}</option>
					{/each}
				</select>
			</label>
			<label>
				Sort order
				<input name="sortOrder" type="number" min="0" value="0" />
			</label>
			<label class="wide">
				Description
				<textarea name="description" rows="2">{created?.values?.description ?? ''}</textarea>
			</label>
			<div class="wide"><button type="submit">Create category</button></div>
		</form>
	</details>

	{#if data.tree.length === 0}
		<EmptyState title="No categories yet">
			<p>Create a category above, then add courses to it.</p>
		</EmptyState>
	{:else}
		<ul class="tree" aria-label="Categories">
			{#each data.tree as node (node.id)}
				{@render categoryNode(node)}
			{/each}
		</ul>
	{/if}
</div>

{#snippet categoryNode(node: Node)}
	{@const updated = resultFor(form, 'update', node.id)}
	{@const deleteError = resultFor(form, 'delete', node.id)}
	{@const courses = data.courseCounts[node.id] ?? 0}
	<li>
		<div class="node card">
			<div class="node-head">
				<div>
					<strong>{node.name}</strong>
					<span class="muted slug">/{node.slug}</span>
				</div>
				<span class="badge">{courses} course{courses === 1 ? '' : 's'}</span>
				<form method="POST" action="?/delete" use:enhance class="delete">
					<input type="hidden" name="id" value={node.id} />
					<button
						type="submit"
						class="secondary small"
						disabled={courses > 0 || node.children.length > 0}
						title={courses > 0 || node.children.length > 0
							? 'Only empty categories can be deleted'
							: undefined}
					>
						Delete
					</button>
				</form>
			</div>
			{#if node.description}<p class="muted desc">{node.description}</p>{/if}
			{#if deleteError?.message}<p class="alert error" role="alert">{deleteError.message}</p>{/if}

			<details open={updated && !updated.ok ? true : undefined}>
				<summary>Edit or move</summary>
				<form method="POST" action="?/update" use:enhance class="grid-form">
					<input type="hidden" name="id" value={node.id} />
					{#if updated?.message}
						<p class="alert {updated.ok ? 'success' : 'error'} wide" role="status">
							{updated.message}
						</p>
					{/if}
					<label>
						Name
						<input name="name" required maxlength="120" value={node.name} />
						<FieldError errors={updated?.errors?.name} />
					</label>
					<label>
						Slug
						<input name="slug" maxlength="80" value={node.slug} />
						<FieldError errors={updated?.errors?.slug} />
					</label>
					<label>
						Parent
						<select name="parentId">
							<option value="" selected={!node.parentId}>None (top level)</option>
							{#each data.options.filter((o) => o.id !== node.id) as opt (opt.id)}
								<option value={opt.id} selected={opt.id === node.parentId}
									>{'— '.repeat(opt.depth)}{opt.name}</option
								>
							{/each}
						</select>
					</label>
					<label>
						Sort order
						<input name="sortOrder" type="number" min="0" value={node.sortOrder} />
					</label>
					<label class="wide">
						Description
						<textarea name="description" rows="2">{node.description}</textarea>
					</label>
					<div class="wide"><button type="submit">Save</button></div>
				</form>
			</details>
		</div>
		{#if node.children.length}
			<ul>
				{#each node.children as child (child.id)}
					{@render categoryNode(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<style>
	summary {
		cursor: pointer;
		font-weight: 600;
		font-size: var(--text-s);
	}

	.create summary {
		font-size: var(--text-m);
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

	.tree,
	.tree ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-s);
	}

	.tree ul {
		margin-block-start: var(--space-s);
		padding-inline-start: var(--space-l);
		border-inline-start: 2px solid var(--color-border);
	}

	.node {
		padding: var(--space-m);
		display: grid;
		gap: var(--space-xs);
	}

	.node-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs) var(--space-s);

		& > div {
			flex: 1 1 12rem;
		}
	}

	.slug {
		font-size: var(--text-xs);
		margin-inline-start: var(--space-2xs);
	}

	.desc {
		font-size: var(--text-s);
	}
</style>
