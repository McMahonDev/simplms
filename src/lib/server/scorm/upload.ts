import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { SCORM_MAX_FILES, SCORM_MAX_UNCOMPRESSED_MB, SCORM_MAX_UPLOAD_MB } from '$app/env/private';
import { createScormActivity } from '../db/activities.js';
import { storage } from '../storage/index.js';
import { ScormImportError } from './errors.js';
import { importScormZip } from './import.js';

/** Upload limit in bytes (the env var is configured in MB and converted by the schema). */
export const maxUploadBytes = SCORM_MAX_UPLOAD_MB;

/**
 * Validates an uploaded zip, extracts it into storage, and adds it to the course as a SCORM
 * activity.
 * yauzl needs random access, so the upload is spooled to a temp file first.
 */
export async function ingestScormUpload(courseId: string, file: File, title?: string) {
	if (file.size === 0) throw new ScormImportError('Choose a .zip file to upload.');
	if (!file.name.toLowerCase().endsWith('.zip')) {
		throw new ScormImportError('SCORM packages must be uploaded as .zip files.');
	}
	if (file.size > maxUploadBytes) {
		throw new ScormImportError(
			`The file is larger than the ${Math.round(maxUploadBytes / 1024 / 1024)} MB upload limit.`
		);
	}

	const tempPath = path.join(os.tmpdir(), `simplms-upload-${randomUUID()}.zip`);
	try {
		await pipeline(
			Readable.fromWeb(file.stream() as unknown as NodeWebReadableStream),
			createWriteStream(tempPath)
		);

		const activityId = randomUUID();
		const imported = await importScormZip({
			zipPath: tempPath,
			activityId,
			storage,
			limits: { maxFiles: SCORM_MAX_FILES, maxTotalBytes: SCORM_MAX_UNCOMPRESSED_MB }
		});

		try {
			return await createScormActivity({
				id: activityId,
				courseId,
				title: title || imported.title,
				version: imported.version,
				entryHref: imported.entryHref,
				storageKey: imported.storageKey,
				manifestJson: imported.json
			});
		} catch (err) {
			await storage.deletePrefix(imported.storageKey);
			throw err;
		}
	} finally {
		await rm(tempPath, { force: true });
	}
}
