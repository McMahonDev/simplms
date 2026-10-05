<script lang="ts">
	type Attempt = { completionStatus: string } | null | undefined;

	/**
	 * `complete` and `result` come from the activity's rules (see completion.ts), so a passing
	 * score set on the activity wins over the package's own pass mark.
	 */
	let {
		attempt,
		complete,
		result = null
	}: { attempt: Attempt; complete: boolean; result?: 'passed' | 'failed' | null } = $props();

	const completion = $derived.by(() => {
		if (complete) return { label: 'Completed', tone: 'success' };
		if (!attempt || attempt.completionStatus === 'not attempted') {
			return { label: 'Not started', tone: '' };
		}
		return { label: 'In progress', tone: 'warning' };
	});

	const success = $derived.by(() => {
		if (result === 'passed') return { label: 'Passed', tone: 'success' };
		if (result === 'failed') return { label: 'Failed', tone: 'danger' };
		return null;
	});
</script>

<span class="statuses">
	<span class="badge {completion.tone}">{completion.label}</span>
	{#if success}<span class="badge {success.tone}">{success.label}</span>{/if}
</span>

<style>
	.statuses {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
</style>
