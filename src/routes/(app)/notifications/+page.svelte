<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { formatDateTime } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const unread = $derived(data.notifications.filter((n) => !n.readAt).length);
</script>

<svelte:head><title>Notifications · SimpLMS</title></svelte:head>

<div class="stack">
	<div class="head">
		<h1>Notifications</h1>
		{#if unread > 0}
			<form method="POST" action="?/readAll" use:enhance>
				<button type="submit" class="secondary small">Mark all as read</button>
			</form>
		{/if}
	</div>

	{#if data.notifications.length === 0}
		<EmptyState title="Nothing yet">
			<p>Enrollments, extra attempts, and course reminders show up here.</p>
		</EmptyState>
	{:else}
		<ul class="list">
			{#each data.notifications as n (n.id)}
				<li class="card item" class:unread={!n.readAt}>
					<form method="POST" action="?/open">
						<input type="hidden" name="id" value={n.id} />
						<button type="submit" class="open">
							<span class="title">
								{#if !n.readAt}<span class="dot" aria-hidden="true"></span><span
										class="visually-hidden">Unread:</span
									>{/if}
								{n.title}
							</span>
							{#if n.body}<span class="muted body">{n.body}</span>{/if}
							<span class="muted when">{formatDateTime(n.createdAt)}</span>
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-s);
		justify-content: space-between;
		align-items: center;
	}

	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}

	.item {
		padding: 0;

		&.unread {
			border-color: var(--color-primary);
		}
	}

	.open {
		all: unset;
		box-sizing: border-box;
		cursor: pointer;
		display: grid;
		gap: var(--space-3xs);
		width: 100%;
		padding: var(--space-s) var(--space-m);
		border-radius: inherit;

		&:hover {
			background: var(--color-surface-2);
		}

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: -2px;
		}
	}

	.title {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.unread .title {
		font-weight: 700;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-primary);
		flex: none;
	}

	.body {
		font-size: var(--text-s);
	}

	.when {
		font-size: var(--text-xs);
	}
</style>
