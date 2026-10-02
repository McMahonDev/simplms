import type { ByteRange } from './storage/types.js';

/**
 * Parses a single-range `Range: bytes=...` header (RFC 9110 section 14.1.2).
 * Returns null when there is no usable range (serve the whole file), or 'unsatisfiable'.
 * Multi-range requests are answered with the full body, which RFC 9110 allows.
 */
export function parseRange(
	header: string | null,
	size: number
): ByteRange | null | 'unsatisfiable' {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, startText, endText] = match;
	if (startText === '' && endText === '') return null;

	let start: number;
	let end: number;
	if (startText === '') {
		// Suffix range: the last N bytes.
		const suffix = Number(endText);
		if (suffix === 0) return 'unsatisfiable';
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(startText);
		end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
	}

	if (start >= size || start > end) return 'unsatisfiable';
	return { start, end };
}
