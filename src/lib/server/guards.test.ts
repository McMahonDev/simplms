import { describe, expect, it } from 'vitest';
import { isSameOrigin, safeRedirectTarget } from './guards.js';

const url = new URL('http://localhost:5173/api/x');
const req = (headers: Record<string, string>) => new Request(url, { method: 'POST', headers });

describe('isSameOrigin', () => {
	it('accepts same-origin requests and requests without browser headers', () => {
		expect(isSameOrigin(req({ origin: 'http://localhost:5173' }), url)).toBe(true);
		expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }), url)).toBe(true);
		expect(isSameOrigin(req({}), url)).toBe(true);
	});

	it('rejects other origins and cross-site fetches', () => {
		expect(isSameOrigin(req({ origin: 'http://evil.test' }), url)).toBe(false);
		expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site' }), url)).toBe(false);
		expect(isSameOrigin(req({ 'sec-fetch-site': 'same-site' }), url)).toBe(false);
	});
});

describe('safeRedirectTarget', () => {
	it('keeps relative paths and rejects everything else', () => {
		expect(safeRedirectTarget('/courses?x=1')).toBe('/courses?x=1');
		expect(safeRedirectTarget('//evil.test')).toBe('/');
		expect(safeRedirectTarget('/\\evil.test')).toBe('/');
		expect(safeRedirectTarget('https://evil.test')).toBe('/');
		expect(safeRedirectTarget(null)).toBe('/');
	});
});
