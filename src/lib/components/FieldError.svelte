<script lang="ts">
	let { errors }: { errors?: string[] } = $props();
</script>

{#if errors?.length}
	<span class="field-error">{errors[0]}</span>
{/if}

<style>
	.field-error {
		color: var(--color-danger);
		font-weight: 400;
		font-size: var(--text-xs);
	}
</style>
