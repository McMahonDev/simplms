import { describe, expect, it } from 'vitest';
import { parseRange } from './http-range.js';

describe('parseRange', () => {
	it('returns null without a usable header', () => {
		expect(parseRange(null, 100)).toBeNull();
		expect(parseRange('items=0-1', 100)).toBeNull();
		expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
	});

	it('parses bounded, open-ended, and suffix ranges', () => {
		expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
		expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
	});

	it('flags unsatisfiable ranges', () => {
		expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
		expect(parseRange('bytes=9-2', 100)).toBe('unsatisfiable');
		expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
	});
});
