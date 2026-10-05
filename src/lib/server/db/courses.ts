import { createHash, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { db } from './index.js';
import { type EnrollmentMethod, category, course, enrollment, scormPackage } from './schema.js';
import { uniqueSlug } from './slugs.js';
import { likeTerm } from './utils.js';

// Everything but the enrollment key, which is only read through getEnrollmentKey.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { enrollmentKey: _enrollmentKey, ...courseColumns } = getTableColumns(course);

export async function getCourseBySlug(slug: string) {
	const [row] = await db
		.select({ course: courseColumns, categoryName: category.name })
		.from(course)
		.innerJoin(category, eq(category.id, course.categoryId))
		.where(eq(course.slug, slug))
		.limit(1);
	return row ? { ...row.course, categoryName: row.categoryName } : null;
}

export type CourseFilters = {
	q?: string;
	categoryId?: string;
	visibility?: 'visible' | 'hidden';
};

/** All courses with headline counts, for the admin list. */
export async function listCoursesForAdmin(filters: CourseFilters = {}) {
	const conditions = [
		filters.q
			? or(ilike(course.title, likeTerm(filters.q)), ilike(course.slug, likeTerm(filters.q)))
			: undefined,
		filters.categoryId ? eq(course.categoryId, filters.categoryId) : undefined,
		filters.visibility ? eq(course.visible, filters.visibility === 'visible') : undefined
	];

	return db
		.select({
			id: course.id,
			title: course.title,
			slug: course.slug,
			visible: course.visible,
			categoryName: category.name,
			students: sql<number>`(select count(*)::int from ${enrollment} where ${enrollment.courseId} = ${course.id} and ${enrollment.role} = 'student' and ${enrollment.status} = 'active')`,
			packages: sql<number>`(select count(*)::int from ${scormPackage} where ${scormPackage.courseId} = ${course.id})`
		})
		.from(course)
		.innerJoin(category, eq(category.id, course.categoryId))
		.where(and(...conditions))
		.orderBy(asc(course.title));
}

/** Every course with the viewer's enrollment (if any), for the browse page. */
export async function listCoursesWithEnrollment(userId: string) {
	return db
		.select({
			id: course.id,
			title: course.title,
			slug: course.slug,
			summary: course.summary,
			visible: course.visible,
			categoryId: course.categoryId,
			enrollmentMethod: course.enrollmentMethod,
			enrollmentRole: enrollment.role,
			enrollmentStatus: enrollment.status
		})
		.from(course)
		.leftJoin(enrollment, and(eq(enrollment.courseId, course.id), eq(enrollment.userId, userId)))
		.orderBy(asc(course.title));
}

export type CourseInput = {
	title: string;
	slug?: string;
	summary: string;
	categoryId: string;
	visible: boolean;
};

export async function createCourse(input: CourseInput, createdBy: string) {
	const slug = await uniqueSlug('course', input.slug || input.title);
	const [row] = await db
		.insert(course)
		.values({ ...input, slug, createdBy })
		.returning();
	return row;
}

export async function updateCourse(id: string, input: CourseInput) {
	const slug = await uniqueSlug('course', input.slug || input.title, id);
	const [row] = await db
		.update(course)
		.set({ ...input, slug })
		.where(eq(course.id, id))
		.returning();
	return row;
}

/** The course's enrollment key, for teachers and for checking a learner's code. */
export async function getEnrollmentKey(id: string) {
	const [row] = await db
		.select({ key: course.enrollmentKey })
		.from(course)
		.where(eq(course.id, id))
		.limit(1);
	return row?.key ?? null;
}

/** True when the code a learner typed matches the course's key (case-sensitive, trimmed). */
export async function checkEnrollmentKey(id: string, attempt: string) {
	const key = await getEnrollmentKey(id);
	if (!key) return false;
	// Hash both sides so the comparison takes the same time whatever the lengths.
	const digest = (s: string) => createHash('sha256').update(s.trim()).digest();
	return timingSafeEqual(digest(key), digest(attempt));
}

/** Sets how people join the course. The key is kept only for the 'key' method. */
export async function setEnrollmentMethod(id: string, method: EnrollmentMethod, key?: string) {
	await db
		.update(course)
		.set({ enrollmentMethod: method, enrollmentKey: method === 'key' ? key : null })
		.where(eq(course.id, id));
}

/** Deletes the course; enrollments, packages, and attempts cascade. Returns package ids. */
export async function deleteCourse(id: string): Promise<string[]> {
	const packages = await db
		.select({ id: scormPackage.id })
		.from(scormPackage)
		.where(eq(scormPackage.courseId, id));
	await db.delete(course).where(eq(course.id, id));
	return packages.map((p) => p.id);
}
