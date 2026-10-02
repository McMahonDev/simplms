/**
 * Test helper: builds an uncompressed ("stored") zip in memory with arbitrary entry names,
 * including hostile ones like "../evil.txt" that normal zip tools refuse to create.
 * Format: PKWARE APPNOTE.TXT sections 4.3.7 (local header) and 4.3.12 (central directory).
 */
import { crc32 } from 'node:zlib';

export type TestZipEntry = { name: string; data?: string | Buffer; symlink?: boolean };

export function makeZip(entries: TestZipEntry[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(0, 8); // stored
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		const mode = entry.symlink ? 0o120777 : 0o100644;
		central.writeUInt32LE((mode << 16) >>> 0, 38);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);

		offset += local.length + name.length + data.length;
	}

	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...locals, ...centrals, end]);
}
