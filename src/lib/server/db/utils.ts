/** Wraps user input for ILIKE, escaping the LIKE wildcards % and _. */
export function likeTerm(q: string) {
	return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

/** True for Postgres unique-constraint violations (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
	const e = err as { code?: string; cause?: { code?: string } } | null;
	return e?.code === '23505' || e?.cause?.code === '23505';
}
