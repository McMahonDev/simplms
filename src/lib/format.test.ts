import { describe, expect, it } from 'vitest';
import { formatDuration } from './format.js';

describe('formatDuration', () => {
	it('formats seconds for people', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(39.4)).toBe('39s');
		expect(formatDuration(95)).toBe('1m 35s');
		expect(formatDuration(3725)).toBe('1h 2m');
	});
});
