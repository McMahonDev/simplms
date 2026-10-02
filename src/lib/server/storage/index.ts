import { STORAGE_DIR } from '$app/env/private';
import { LocalDiskStorage } from './local.js';
import type { Storage } from './types.js';

export type { ByteRange, ObjectInfo, Storage } from './types.js';

/** The app's storage driver. Swap for an R2/S3 driver here when deploying elsewhere. */
export const storage: Storage = new LocalDiskStorage(STORAGE_DIR);
