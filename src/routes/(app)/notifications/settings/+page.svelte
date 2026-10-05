<script lang="ts">
	import { enhance } from '$app/forms';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const saved = $derived(resultFor(form, 'save'));
</script>

<svelte:head><title>Notification settings · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/notifications">Notifications</a> › Settings
	</nav>
	<h1>Notification settings</h1>
	<p class="muted">
		Everything shows up under Notifications. Choose which ones are also emailed to
		<strong>{data.email}</strong>.
	</p>

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="card stack"
	>
		<fieldset class="types">
			<legend class="visually-hidden">Email me about</legend>
			{#each data.types as t (t.type)}
				<label class="type">
					<input type="checkbox" name="email" value={t.type} checked={t.email} />
					<span>
						<strong>{t.label}</strong>
						<span class="muted">{t.description}</span>
					</span>
				</label>
			{/each}
		</fieldset>
		<div class="cluster">
			<button type="submit">Save</button>
			{#if saved?.ok}<span class="badge success" role="status">{saved.message}</span>{/if}
		</div>
	</form>
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	.types {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-s);
	}

	.type {
		display: flex;
		gap: var(--space-xs);
		align-items: start;

		& input {
			margin-block-start: 0.3em;
		}

		& > span {
			display: grid;
		}
	}
</style>
