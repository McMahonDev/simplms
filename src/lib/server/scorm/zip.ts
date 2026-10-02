import path from 'node:path/posix';
import { Transform } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { ScormImportError } from './errors.js';

export type ExtractLimits = {
	/** Maximum number of file entries. */
	maxFiles: number;
	/** Maximum total uncompressed bytes, counted as data is actually inflated. */
	maxTotalBytes: number;
};

export type ExtractResult = { files: number; bytes: number; names: Set<string> };

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/**
 * Validates a zip entry name and returns its normalized relative path.
 * Rejects absolute paths, drive letters, backslashes, NUL bytes, and any path that
 * resolves outside the extraction root ("zip slip").
 */
export function safeEntryPath(fileName: string): string {
	if (
		fileName.includes('\0') ||
		fileName.includes('\\') ||
		fileName.startsWith('/') ||
		/^[a-z]:/i.test(fileName)
	) {
		throw new ScormImportError(`The package contains an unsafe file path: ${fileName}`);
	}
	const normalized = path.normalize(fileName);
	if (normalized === '..' || normalized.startsWith('../') || normalized.split('/').includes('..')) {
		throw new ScormImportError(`The package contains a path that escapes its folder: ${fileName}`);
	}
	return normalized.replace(/^\.\//, '');
}

function isSymlink(entry: Entry): boolean {
	// Unix mode bits live in the high 16 bits of the external attributes.
	return ((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK;
}

async function openZip(zipPath: string): Promise<ZipFile> {
	try {
		// decodeStrings (default) makes yauzl reject "../" and absolute names itself;
		// safeEntryPath below repeats the check so we never rely on a single guard.
		return await yauzl.openPromise(zipPath, { strictFileNames: false, validateEntrySizes: true });
	} catch {
		throw new ScormImportError('The upload is not a valid zip file.');
	}
}

/** Maps yauzl's own validation errors to user-facing messages. */
function translateZipError(err: unknown): never {
	if (err instanceof ScormImportError) throw err;
	const message = err instanceof Error ? err.message : String(err);
	if (/invalid relative path|absolute path|invalid characters/i.test(message)) {
		throw new ScormImportError(`The package contains an unsafe file path (${message}).`);
	}
	throw new ScormImportError(`The zip file could not be read (${message}).`);
}

/** Reads a single entry into memory, or returns null if it doesn't exist. */
export async function readZipEntry(
	zipPath: string,
	name: string,
	maxBytes: number
): Promise<Buffer | null> {
	const zip = await openZip(zipPath);
	try {
		for await (const entry of zip.eachEntry()) {
			if (entry.fileName !== name) continue;
			if (entry.uncompressedSize > maxBytes) {
				throw new ScormImportError(`${name} is larger than ${maxBytes} bytes.`);
			}
			const chunks: Buffer[] = [];
			for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk);
			return Buffer.concat(chunks);
		}
		return null;
	} catch (err) {
		translateZipError(err);
	} finally {
		zip.close();
	}
}

/**
 * Streams every file entry to `write`, enforcing limits as it goes.
 * Directory entries are skipped (directories are implied by file paths).
 */
export async function extractZip(
	zipPath: string,
	limits: ExtractLimits,
	write: (relativePath: string, body: AsyncIterable<Uint8Array>) => Promise<void>
): Promise<ExtractResult> {
	const zip = await openZip(zipPath);
	const result: ExtractResult = { files: 0, bytes: 0, names: new Set() };

	try {
		if (zip.entryCount > limits.maxFiles * 2) {
			// Cheap early exit for archives that are obviously over the limit.
			throw new ScormImportError(`The package has more than ${limits.maxFiles} files.`);
		}

		for await (const entry of zip.eachEntry()) {
			if (entry.fileName.endsWith('/')) continue;
			if (isSymlink(entry)) {
				throw new ScormImportError(`The package contains a symbolic link: ${entry.fileName}`);
			}
			const relativePath = safeEntryPath(entry.fileName);

			result.files += 1;
			if (result.files > limits.maxFiles) {
				throw new ScormImportError(`The package has more than ${limits.maxFiles} files.`);
			}
			// Declared sizes can lie, so this is only a fast pre-check; the counter below is the guard.
			if (result.bytes + entry.uncompressedSize > limits.maxTotalBytes) {
				throw tooLarge(limits);
			}

			const counter = new Transform({
				transform(chunk: Buffer, _enc, done) {
					result.bytes += chunk.length;
					if (result.bytes > limits.maxTotalBytes) done(tooLarge(limits));
					else done(null, chunk);
				}
			});
			const stream = (await zip.openReadStreamPromise(entry)).pipe(counter);
			await write(relativePath, stream);
			result.names.add(relativePath);
		}
		return result;
	} catch (err) {
		translateZipError(err);
	} finally {
		zip.close();
	}
}

function tooLarge(limits: ExtractLimits) {
	const mb = Math.round(limits.maxTotalBytes / 1024 / 1024);
	return new ScormImportError(`The package is larger than ${mb} MB when uncompressed.`);
}
