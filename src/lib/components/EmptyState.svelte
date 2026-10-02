<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="empty">
	<p class="title">{title}</p>
	{#if children}<div class="body">{@render children()}</div>{/if}
</div>

<style>
	.empty {
		padding: var(--space-xl) var(--space-l);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-m);
		text-align: center;
		color: var(--color-text-muted);
		display: grid;
		gap: var(--space-xs);
		justify-items: center;
	}

	.title {
		font-weight: 600;
		color: var(--color-text);
	}
</style>
