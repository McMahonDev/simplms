/**
 * Demo seed: `pnpm db:seed`
 *
 * Creates users for every role, a small category tree, four courses, and enrollments.
 * Passwords are random per run and printed to the console. Set SEED_PASSWORD to give
 * every seeded user the same known password (the e2e tests do this).
 *
 * Refuses to run twice; use `pnpm db:reset` to start over.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createDb } from '../src/lib/server/db/client';
import * as t from '../src/lib/server/db/schema';
import { loadScriptEnv } from '../src/lib/server/env-schema';
import { importScormZip } from '../src/lib/server/scorm/import';
import { LocalDiskStorage } from '../src/lib/server/storage/local';

const env = loadScriptEnv();
const db = createDb(env.DATABASE_URL);

type SeedUser = { key: string; name: string; email: string; role: 'admin' | 'manager' | 'user' };

const users: SeedUser[] = [
	{ key: 'admin', name: 'Ada Admin', email: 'admin@simplms.test', role: 'admin' },
	{ key: 'manager', name: 'Morgan Manager', email: 'manager@simplms.test', role: 'manager' },
	{ key: 'teacher1', name: 'Tara Teacher', email: 'teacher1@simplms.test', role: 'user' },
	{ key: 'teacher2', name: 'Theo Teacher', email: 'teacher2@simplms.test', role: 'user' },
	{ key: 'student1', name: 'Sam Student', email: 'student1@simplms.test', role: 'user' },
	{ key: 'student2', name: 'Sasha Student', email: 'student2@simplms.test', role: 'user' },
	{ key: 'student3', name: 'Sky Student', email: 'student3@simplms.test', role: 'user' },
	{ key: 'student4', name: 'Sol Student', email: 'student4@simplms.test', role: 'user' },
	{ key: 'student5', name: 'Sage Student', email: 'student5@simplms.test', role: 'user' }
];

function makePassword() {
	return process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
}

async function main() {
	const existing = await db.query.user.findFirst({ where: eq(t.user.email, users[0].email) });
	if (existing) {
		console.log('Database already seeded. Run `pnpm db:reset` to wipe and reseed.');
		return;
	}

	const credentials: { email: string; password: string; role: string }[] = [];
	const userIds: Record<string, string> = {};

	await db.transaction(async (tx) => {
		for (const u of users) {
			const password = makePassword();
			const [row] = await tx
				.insert(t.user)
				.values({ name: u.name, email: u.email, role: u.role, emailVerified: true })
				.returning({ id: t.user.id });
			// Same shape Better Auth writes on email sign-up.
			await tx.insert(t.account).values({
				userId: row.id,
				accountId: row.id,
				providerId: 'credential',
				password: await hashPassword(password)
			});
			userIds[u.key] = row.id;
			credentials.push({ email: u.email, password, role: u.role });
		}

		const [company] = await tx
			.insert(t.category)
			.values({
				name: 'Company',
				slug: 'company',
				description: 'Policies and training for everyone.',
				sortOrder: 0
			})
			.returning();
		const [compliance] = await tx
			.insert(t.category)
			.values({
				name: 'Compliance',
				slug: 'compliance',
				description: 'Mandatory annual training.',
				parentId: company.id,
				sortOrder: 0
			})
			.returning();
		const [product] = await tx
			.insert(t.category)
			.values({
				name: 'Product Training',
				slug: 'product-training',
				description: 'Learn the products we build and sell.',
				sortOrder: 1
			})
			.returning();

		const courseRows = await tx
			.insert(t.course)
			.values([
				{
					categoryId: product.id,
					title: 'Golf Fundamentals',
					slug: 'golf-fundamentals',
					summary:
						'Rustici Software’s Golf Examples, packaged as SCORM 1.2 and SCORM 2004. Covers etiquette, handicapping, and how to play.',
					visible: true,
					createdBy: userIds.admin
				},
				{
					categoryId: compliance.id,
					title: 'Workplace Safety',
					slug: 'workplace-safety',
					summary: 'Hazard awareness, incident reporting, and emergency procedures.',
					visible: true,
					createdBy: userIds.manager
				},
				{
					categoryId: compliance.id,
					title: 'Data Privacy Basics',
					slug: 'data-privacy-basics',
					summary: 'How we collect, store, and protect personal data.',
					visible: true,
					createdBy: userIds.manager
				},
				{
					categoryId: product.id,
					title: 'Product Roadmap 2027',
					slug: 'product-roadmap-2027',
					summary: 'Draft course, hidden from learners until launch.',
					visible: false,
					createdBy: userIds.admin
				}
			])
			.returning();
		const courseId = Object.fromEntries(courseRows.map((c) => [c.slug, c.id]));

		const enroll = (user: string, course: string, role: 'teacher' | 'student') => ({
			userId: userIds[user],
			courseId: courseId[course],
			role
		});
		await tx
			.insert(t.enrollment)
			.values([
				enroll('teacher2', 'golf-fundamentals', 'teacher'),
				enroll('student1', 'golf-fundamentals', 'student'),
				enroll('student2', 'golf-fundamentals', 'student'),
				enroll('student3', 'golf-fundamentals', 'student'),
				enroll('teacher1', 'workplace-safety', 'teacher'),
				enroll('student1', 'workplace-safety', 'student'),
				enroll('student4', 'workplace-safety', 'student'),
				enroll('teacher1', 'data-privacy-basics', 'teacher'),
				enroll('student2', 'data-privacy-basics', 'student'),
				enroll('student5', 'data-privacy-basics', 'student'),
				enroll('teacher2', 'product-roadmap-2027', 'teacher')
			]);
	});

	await seedGolfPackages();

	console.log('\nSeeded SimpLMS. Sign in with:\n');
	console.table(credentials);
	if (!process.env.SEED_PASSWORD) {
		console.log('Passwords are random per seed run. Save them now or set SEED_PASSWORD.\n');
	}
}

/** Imports Rustici's Golf Examples (SCORM 1.2 and 2004) into the Golf Fundamentals course. */
async function seedGolfPackages() {
	const golf = await db.query.course.findFirst({ where: eq(t.course.slug, 'golf-fundamentals') });
	if (!golf) return;
	const storage = new LocalDiskStorage(env.STORAGE_DIR);
	const packages = [
		{ file: 'RuntimeBasicCalls_SCORM12.zip', title: 'Golf Explained (SCORM 1.2)' },
		{ file: 'RuntimeBasicCalls_SCORM20043rdEdition.zip', title: 'Golf Explained (SCORM 2004)' }
	];
	for (const [sortOrder, p] of packages.entries()) {
		const id = randomUUID();
		const imported = await importScormZip({
			zipPath: fileURLToPath(new URL(`../fixtures/scorm/${p.file}`, import.meta.url)),
			packageId: id,
			storage,
			limits: { maxFiles: env.SCORM_MAX_FILES, maxTotalBytes: env.SCORM_MAX_UNCOMPRESSED_MB }
		});
		await db.insert(t.scormPackage).values({
			id,
			courseId: golf.id,
			title: p.title,
			version: imported.version,
			entryHref: imported.entryHref,
			storageKey: imported.storageKey,
			manifestJson: imported.json,
			sortOrder
		});
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
