/** A problem with an uploaded package, safe to show to the uploader. */
export class ScormImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ScormImportError';
	}
}
