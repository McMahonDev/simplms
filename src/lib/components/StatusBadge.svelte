<script lang="ts">
	type Attempt = { completionStatus: string; successStatus: string } | null | undefined;

	/** `complete` comes from the activity's completion rule (see completion.ts). */
	let { attempt, complete }: { attempt: Attempt; complete: boolean } = $props();

	// Completion follows the activity's rule; pass/fail is shown as well when the SCO reported it
	// (SCORM 2004 tracks them separately, and 1.2 statuses are mapped onto both).
	const completion = $derived.by(() => {
		if (complete) return { label: 'Completed', tone: 'success' };
		if (!attempt || attempt.completionStatus === 'not attempted') {
			return { label: 'Not started', tone: '' };
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
