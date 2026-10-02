import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type ByteRange, type ObjectInfo, type Storage, assertSafeKey } from './types.js';

/** Stores objects as files under a root directory. */
export class LocalDiskStorage implements Storage {
	readonly root: string;

	constructor(root: string) {
		this.root = path.resolve(root);
	}

	private pathFor(key: string): string {
		assertSafeKey(key);
		const full = path.resolve(this.root, ...key.split('/'));
		// Belt and braces: the resolved path must stay inside the root.
		if (!full.startsWith(this.root + path.sep)) throw new Error(`Key escapes storage root: ${key}`);
		return full;
	}

	async put(key: string, body: Uint8Array | AsyncIterable<Uint8Array>): Promise<void> {
		const file = this.pathFor(key);
		await mkdir(path.dirname(file), { recursive: true });
		if (body instanceof Uint8Array) {
			await writeFile(file, body);
		} else {
			await pipeline(Readable.from(body), createWriteStream(file));
		}
	}

	async head(key: string): Promise<ObjectInfo | null> {
		try {
			const s = await stat(this.pathFor(key));
			return s.isFile() ? { size: s.size, lastModified: s.mtime } : null;
		} catch {
			return null;
		}
	}

	async get(key: string, range?: ByteRange): Promise<ReadableStream<Uint8Array> | null> {
		if (!(await this.head(key))) return null;
		const stream = createReadStream(this.pathFor(key), range);
		return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
	}

	async deletePrefix(prefix: string): Promise<void> {
		await rm(this.pathFor(prefix), { recursive: true, force: true });
	}
}
