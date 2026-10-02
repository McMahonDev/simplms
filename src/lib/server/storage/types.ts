/**
 * Minimal object storage interface. The local disk driver implements it now; an
 * S3-compatible (R2) driver can implement the same methods later without touching callers.
 *
 * Keys are forward-slash paths relative to the storage root, e.g. "scorm/<id>/index.html".
 * Bodies are exposed as web ReadableStreams so route handlers stay runtime-portable.
 */
export interface ByteRange {
	/** Inclusive start offset. */
	start: number;
	/** Inclusive end offset. */
	end: number;
}

export interface ObjectInfo {
	size: number;
	lastModified: Date;
}

export interface Storage {
	put(key: string, body: Uint8Array | AsyncIterable<Uint8Array>): Promise<void>;
	head(key: string): Promise<ObjectInfo | null>;
	get(key: string, range?: ByteRange): Promise<ReadableStream<Uint8Array> | null>;
	/** Deletes every object whose key starts with `prefix/`. */
	deletePrefix(prefix: string): Promise<void>;
}

/**
 * Rejects keys that could escape the storage root or are otherwise ambiguous.
 * Drivers call this before touching the backing store.
 */
export function assertSafeKey(key: string): void {
	const segments = key.split('/');
	if (
		key.length === 0 ||
		key.startsWith('/') ||
		key.includes('\\') ||
		key.includes('\0') ||
		segments.some((s) => s === '' || s === '.' || s === '..')
	) {
		throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
	}
}
