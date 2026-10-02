/**
 * Turns an uploaded zip into an extracted, validated SCORM package in storage.
 * Free of `$app/*` imports so the seed script can reuse it.
 */
import type { Storage } from '../storage/types.js';
import { ScormImportError } from './errors.js';
import { type ParsedManifest, parseManifest } from './manifest.js';
import { type ExtractLimits, extractZip, readZipEntry } from './zip.js';

const MANIFEST = 'imsmanifest.xml';
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

export type ImportedPackage = ParsedManifest & { storageKey: string; files: number; bytes: number };

export function storageKeyFor(packageId: string) {
	return `scorm/${packageId}`;
}

export async function importScormZip(options: {
	zipPath: string;
	packageId: string;
	storage: Storage;
	limits: ExtractLimits;
}): Promise<ImportedPackage> {
	const { zipPath, packageId, storage, limits } = options;

	// Validate the manifest before writing anything to storage.
	const manifestXml = await readZipEntry(zipPath, MANIFEST, MAX_MANIFEST_BYTES);
	if (!manifestXml) {
		throw new ScormImportError(
			'imsmanifest.xml was not found at the root of the zip. Zip the package contents, not the folder that contains them.'
		);
	}
	const manifest = parseManifest(manifestXml.toString('utf8'));

	const storageKey = storageKeyFor(packageId);
	try {
		const extracted = await extractZip(zipPath, limits, (relativePath, body) =>
			storage.put(`${storageKey}/${relativePath}`, body)
		);

		const launchFile = decodeURIComponent(manifest.entryHref.split(/[?#]/)[0]);
		if (!extracted.names.has(launchFile)) {
			throw new ScormImportError(
				`The launch file "${launchFile}" named in imsmanifest.xml is not in the zip.`
			);
		}
		return { ...manifest, storageKey, files: extracted.files, bytes: extracted.bytes };
	} catch (err) {
		await storage.deletePrefix(storageKey);
		throw err;
	}
}
