<script lang="ts">
	import { page } from '$app/state';

	const copy: Record<number, { title: string; body: string }> = {
		403: {
			title: 'You don’t have access to this page',
			body: 'Ask a teacher or administrator if you think you should.'
		},
		404: { title: 'Page not found', body: 'The link may be broken, or the page may have moved.' },
		405: { title: 'That action isn’t allowed here', body: 'Go back and try again.' }
	};

	const status = $derived(page.status);
	const text = $derived(
		copy[status] ?? {
			title: 'Something went wrong',
			body: 'An unexpected error occurred. Try again in a moment.'
		}
	);
</script>

<svelte:head><title>{text.title} · SimpLMS</title></svelte:head>

<section class="error" aria-labelledby="error-title">
	<p class="status">{status}</p>
	<h1 id="error-title">{text.title}</h1>
	<p class="muted">{text.body}</p>
	{#if page.error?.message && status < 500 && !copy[status]}
		<p class="muted detail">{page.error.message}</p>
	{/if}
	<div class="cluster">
		<a class="button" href="/">Go to dashboard</a>
		<a class="button secondary" href="/courses">Browse courses</a>
	</div>
</section>

<style>
	.error {
		max-width: 36rem;
		margin: clamp(2rem, 10vh, 6rem) auto;
		padding-inline: var(--space-m);
		display: grid;
		gap: var(--space-s);
	}

	.status {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--color-primary);
	}

	.detail {
		font-size: var(--text-s);
	}
</style>
