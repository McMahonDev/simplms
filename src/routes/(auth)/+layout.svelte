<script lang="ts">
	let { children } = $props();
</script>

<main>
	<div class="card">
		<p class="brand">SimpLMS</p>
		{@render children()}
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: var(--space-m);
	}

	.card {
		width: min(100%, 26rem);
		display: grid;
		gap: var(--space-m);
	}

	.brand {
		font-weight: 700;
		color: var(--color-primary);
		letter-spacing: 0.02em;
	}
</style>
