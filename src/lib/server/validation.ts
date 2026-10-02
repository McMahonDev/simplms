import { z } from 'zod';

export type FieldErrors = Record<string, string[] | undefined>;

export type ParseResult<T> =
	| { ok: true; data: T }
	| { ok: false; errors: FieldErrors; message: string; values: Record<string, string> };

/**
 * Validates a FormData submission against a Zod object schema.
 * Returns the raw string values on failure so the form can be re-filled.
 */
export function parseForm<S extends z.ZodType>(
	schema: S,
	formData: FormData
): ParseResult<z.output<S>> {
	const raw: Record<string, FormDataEntryValue> = {};
	for (const [key, value] of formData) raw[key] = value;

	const result = schema.safeParse(raw);
	if (result.success) return { ok: true, data: result.data };

	const values: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		// Never echo passwords or files back to the client.
		if (typeof value === 'string' && !key.toLowerCase().includes('password')) values[key] = value;
	}
	const flat = z.flattenError(result.error);
	return {
		ok: false,
		errors: flat.fieldErrors as FieldErrors,
		message: flat.formErrors[0] ?? 'Please fix the highlighted fields.',
		values
	};
}

/** A form-level failure payload with the same shape as a failed parseForm. */
export function formError(message: string, values: Record<string, string> = {}) {
	return { ok: false as const, message, errors: {} as FieldErrors, values };
}

/** Common field helpers for form data (checkboxes send "on" or nothing). */
export const formFields = {
	checkbox: () =>
		z
			.literal('on')
			.optional()
			.transform((v) => v === 'on'),
	trimmed: (max = 200) => z.string().trim().min(1, 'Required').max(max),
	optionalText: (max = 5000) => z.string().trim().max(max).optional().default(''),
	uuid: () => z.uuid('Invalid id'),
	optionalUuid: () =>
		z
			.string()
			.optional()
			.transform((v) => (v ? v : null))
			.pipe(z.uuid().nullable()),
	slug: () =>
		z
			.string()
			.trim()
			.toLowerCase()
			.min(1, 'Required')
			.max(80)
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single dashes'),
	/** Blank means "generate from the title". */
	optionalSlug: () =>
		z
			.union([z.literal(''), formFields.slug()])
			.optional()
			.transform((v) => v || undefined),
	sortOrder: () => z.coerce.number().int().min(0).max(100000).default(0)
};

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}
