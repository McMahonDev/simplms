<script lang="ts">
	type Attempt = { completionStatus: string; successStatus: string } | null | undefined;

	let { attempt }: { attempt: Attempt } = $props();

	const status = $derived.by(() => {
		if (!attempt || attempt.completionStatus === 'not attempted') {
			return { label: 'Not started', tone: '' };
		}
		if (attempt.successStatus === 'failed') return { label: 'Failed', tone: 'danger' };
		if (attempt.successStatus === 'passed') return { label: 'Passed', tone: 'success' };
		if (attempt.completionStatus === 'completed') return { label: 'Completed', tone: 'success' };
		return { label: 'In progress', tone: 'warning' };
	});
</script>

<span class="badge {status.tone}">{status.label}</span>
