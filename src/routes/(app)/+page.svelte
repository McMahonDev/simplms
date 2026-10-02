<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Dashboard · SimpLMS</title></svelte:head>

<h1>Welcome, {data.user.name}</h1>
<p class="muted">You are signed in as {data.user.email} ({data.user.role}).</p>
