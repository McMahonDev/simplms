/**
 * The loose shape all form actions in this app return, success or failure.
 * Pages cast `form` to this so they can render messages without narrowing every union.
 */
export type FormResult = {
	action?: string;
	id?: string;
	ok?: boolean;
	message?: string;
	errors?: Record<string, string[] | undefined>;
	values?: Record<string, string>;
};

/** Returns the result only when it belongs to the given action (and row, if given). */
export function resultFor(form: unknown, action: string, id?: string): FormResult | undefined {
	const r = form as FormResult | null | undefined;
	if (!r || r.action !== action) return undefined;
	if (id !== undefined && r.id !== id) return undefined;
	return r;
}
