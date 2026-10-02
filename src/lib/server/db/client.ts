import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/** Builds a Drizzle client. Kept free of `$app/*` imports so scripts can use it. */
export function createDb(url: string) {
	const client = postgres(url);
	return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
