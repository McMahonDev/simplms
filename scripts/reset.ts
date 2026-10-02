/**
 * Drops every table and the migration journal so `pnpm db:reset` can migrate and reseed.
 * Also clears uploaded SCORM files. Local development only.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { loadScriptEnv } from '../src/lib/server/env-schema';

const env = loadScriptEnv();
const sql = postgres(env.DATABASE_URL, { onnotice: () => {} });

await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();

await rm(path.resolve(env.STORAGE_DIR, 'scorm'), { recursive: true, force: true });
console.log('Database and SCORM storage cleared.');
