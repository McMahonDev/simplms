import { DATABASE_URL } from '$app/env/private';
import { createDb } from './client.js';

export const db = createDb(DATABASE_URL);
