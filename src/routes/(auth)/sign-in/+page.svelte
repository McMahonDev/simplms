<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · SimpLMS</title></svelte:head>

<h1>Sign in</h1>

{#if form?.message}
	<p class="alert error" role="alert">{form.message}</p>
{/if}

<form method="POST" class="stack" action="?{page.url.searchParams}">
	<label>
		Email
		<input
			type="email"
			name="email"
			autocomplete="email"
			required
			value={form?.values?.email ?? ''}
			aria-invalid={form?.errors?.email ? 'true' : undefined}
		/>
		{#if form?.errors?.email}<span class="field-error">{form.errors.email[0]}</span>{/if}
	</label>
	<label>
		Password
		<input type="password" name="password" autocomplete="current-password" required />
		{#if form?.errors?.password}<span class="field-error">{form.errors.password[0]}</span>{/if}
	</label>
	<button type="submit">Sign in</button>
</form>

{#if data.allowSignup}
	<p class="muted">No account? <a href="/sign-up">Create one</a></p>
{/if}

<style>
	.field-error {
		color: var(--color-danger);
		font-weight: 400;
	}
</style>
