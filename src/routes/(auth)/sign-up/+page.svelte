<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Create account · SimpLMS</title></svelte:head>

<h1>Create account</h1>

{#if form?.message}
	<p class="alert error" role="alert">{form.message}</p>
{/if}

<form method="POST" class="stack">
	<label>
		Name
		<input type="text" name="name" autocomplete="name" required value={form?.values?.name ?? ''} />
		{#if form?.errors?.name}<span class="field-error">{form.errors.name[0]}</span>{/if}
	</label>
	<label>
		Email
		<input
			type="email"
			name="email"
			autocomplete="email"
			required
			value={form?.values?.email ?? ''}
		/>
		{#if form?.errors?.email}<span class="field-error">{form.errors.email[0]}</span>{/if}
	</label>
	<label>
		Password
		<input type="password" name="password" autocomplete="new-password" minlength="8" required />
		{#if form?.errors?.password}<span class="field-error">{form.errors.password[0]}</span>{/if}
	</label>
	<button type="submit">Create account</button>
</form>

<p class="muted">Already registered? <a href="/sign-in">Sign in</a></p>

<style>
	.field-error {
		color: var(--color-danger);
		font-weight: 400;
	}
</style>
