import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from '../storage/local.js';
import { ScormImportError } from './errors.js';
import { importScormZip } from './import.js';
import { makeZip, type TestZipEntry } from './test-zip.js';
import { safeEntryPath } from './zip.js';

const golf12 = new URL('../../../../fixtures/scorm/RuntimeBasicCalls_SCORM12.zip', import.meta.url);
const golf2004 = new URL(
	'../../../../fixtures/scorm/RuntimeBasicCalls_SCORM20043rdEdition.zip',
	import.meta.url
);
const manifest12 = readFileSync(new URL('./fixtures/golf-12.xml', import.meta.url), 'utf8');

const limits = { maxFiles: 1000, maxTotalBytes: 50 * 1024 * 1024 };

let dir: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'simplms-test-'));
	storage = new LocalDiskStorage(path.join(dir, 'storage'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function zipFile(entries: TestZipEntry[]) {
	const file = path.join(dir, 'upload.zip');
	await writeFile(file, makeZip(entries));
	return file;
}

async function storedFiles() {
	const root = path.join(dir, 'storage');
	if (!existsSync(root)) return [];
	return (await readdir(root, { recursive: true })).map(String).sort();
}

describe('importScormZip', () => {
	it('extracts the Golf SCORM 1.2 package', async () => {
		const result = await importScormZip({
			zipPath: fileURLToPath(golf12),
			packageId: 'pkg12',
			storage,
			limits
		});
		expect(result.version).toBe('1.2');
		expect(result.entryHref).toBe('shared/launchpage.html');
		expect(result.storageKey).toBe('scorm/pkg12');
		expect(result.files).toBe(44); // 49 zip entries, 5 of them directories
		expect(await storage.head('scorm/pkg12/shared/launchpage.html')).not.toBeNull();
	});

	it('extracts the Golf SCORM 2004 package', async () => {
		const result = await importScormZip({
			zipPath: fileURLToPath(golf2004),
			packageId: 'pkg2004',
			storage,
			limits
		});
		expect(result.version).toBe('2004');
		expect(await storage.head('scorm/pkg2004/imsmanifest.xml')).not.toBeNull();
	});

	it('rejects zips with ../ paths (zip slip) and writes nothing outside the package', async () => {
		const zipPath = await zipFile([
			{ name: 'imsmanifest.xml', data: manifest12 },
			{ name: 'shared/launchpage.html', data: '<html></html>' },
			{ name: '../../evil.txt', data: 'pwned' }
		]);
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			ScormImportError
		);
		expect(existsSync(path.join(dir, 'evil.txt'))).toBe(false);
		// Files extracted before the bad entry are cleaned up.
		expect(await storedFiles()).toEqual(['scorm']);
	});

	it('rejects nested ../ that resolves outside the folder', async () => {
		const zipPath = await zipFile([
			{ name: 'imsmanifest.xml', data: manifest12 },
			{ name: 'shared/launchpage.html', data: '<html></html>' },
			{ name: 'a/../../evil.txt', data: 'pwned' }
		]);
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			/unsafe|escapes/
		);
	});

	it('rejects symbolic links', async () => {
		const zipPath = await zipFile([
			{ name: 'imsmanifest.xml', data: manifest12 },
			{ name: 'shared/launchpage.html', data: '/etc/passwd', symlink: true }
		]);
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			/symbolic link/
		);
	});

	it('requires imsmanifest.xml at the package root', async () => {
		const zipPath = await zipFile([{ name: 'course/imsmanifest.xml', data: manifest12 }]);
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			/imsmanifest.xml was not found at the root/
		);
	});

	it('requires the launch file to exist', async () => {
		const zipPath = await zipFile([{ name: 'imsmanifest.xml', data: manifest12 }]);
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			/launch file "shared\/launchpage.html"/
		);
		expect(await storage.head('scorm/p/imsmanifest.xml')).toBeNull();
	});

	it('caps the number of files', async () => {
		const zipPath = await zipFile([
			{ name: 'imsmanifest.xml', data: manifest12 },
			{ name: 'shared/launchpage.html', data: 'x' },
			{ name: 'b.txt', data: 'x' }
		]);
		await expect(
			importScormZip({ zipPath, packageId: 'p', storage, limits: { ...limits, maxFiles: 2 } })
		).rejects.toThrow(/more than 2 files/);
	});

	it('caps total uncompressed size', async () => {
		const zipPath = await zipFile([
			{ name: 'imsmanifest.xml', data: manifest12 },
			{ name: 'shared/launchpage.html', data: Buffer.alloc(4096) }
		]);
		await expect(
			importScormZip({
				zipPath,
				packageId: 'p',
				storage,
				limits: { ...limits, maxTotalBytes: 2048 }
			})
		).rejects.toThrow(/larger than/);
	});

	it('rejects files that are not zips', async () => {
		const zipPath = path.join(dir, 'not.zip');
		await writeFile(zipPath, 'hello');
		await expect(importScormZip({ zipPath, packageId: 'p', storage, limits })).rejects.toThrow(
			/not a valid zip/
		);
	});
});

describe('safeEntryPath', () => {
	it('normalizes harmless paths', () => {
		expect(safeEntryPath('./a/b/../c.html')).toBe('a/c.html');
	});

	it.each(['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\..\\x', 'a\0b'])('rejects %j', (p) => {
		expect(() => safeEntryPath(p)).toThrow(ScormImportError);
	});
});

describe('LocalDiskStorage', () => {
	it('refuses keys that escape the root', async () => {
		await expect(storage.put('../x', new Uint8Array())).rejects.toThrow(/Unsafe storage key/);
		await expect(storage.head('scorm/../../x')).resolves.toBeNull();
	});

	it('serves byte ranges', async () => {
		await storage.put('a/b.txt', new TextEncoder().encode('0123456789'));
		const stream = await storage.get('a/b.txt', { start: 2, end: 5 });
		expect(await new Response(stream).text()).toBe('2345');
	});
});
