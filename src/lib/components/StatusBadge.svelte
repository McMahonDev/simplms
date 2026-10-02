<script lang="ts">
	type Attempt = { completionStatus: string; successStatus: string } | null | undefined;

	let { attempt }: { attempt: Attempt } = $props();

	// Completion and success are separate in SCORM 2004 (1.2 statuses are mapped onto both),
	// so show completion first and add pass/fail when the SCO reported it.
	const completion = $derived.by(() => {
		if (!attempt || attempt.completionStatus === 'not attempted') {
			return { label: 'Not started', tone: '' };
		}
		if (attempt.completionStatus === 'completed' || attempt.successStatus === 'passed') {
			return { label: 'Completed', tone: 'success' };
		}
		return { label: 'In progress', tone: 'warning' };
	});

	const success = $derived.by(() => {
		if (attempt?.successStatus === 'passed') return { label: 'Passed', tone: 'success' };
		if (attempt?.successStatus === 'failed') return { label: 'Failed', tone: 'danger' };
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
