/** Formatting helpers safe for both server and client. */

/** 3725 -> "1h 2m", 95 -> "1m 35s", 0 -> "0s". */
export function formatDuration(totalSeconds: number): string {
	const s = Math.round(totalSeconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(value: Date | string | null | undefined): string {
	if (!value) return '—';
	return dateTime.format(typeof value === 'string' ? new Date(value) : value);
}
