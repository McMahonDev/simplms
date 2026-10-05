import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from './index.js';
import { type EnrollmentRole, type EnrollmentStatus, course, enrollment, user } from './schema.js';
import { isUniqueViolation, likeTerm } from './utils.js';

export type EnrollmentFilters = {
	q?: string;
	role?: EnrollmentRole;
	status?: EnrollmentStatus;
};

/** A course's enrollments, teachers first, optionally filtered by name/email, role, and status. */
export async function listEnrollments(courseId: string, filters: EnrollmentFilters = {}) {
	const conditions = [
		eq(enrollment.courseId, courseId),
		filters.q
			? or(ilike(user.name, likeTerm(filters.q)), ilike(user.email, likeTerm(filters.q)))
			: undefined,
		filters.role ? eq(enrollment.role, filters.role) : undefined,
		filters.status ? eq(enrollment.status, filters.status) : undefined
	];

	return db
		.select({
			id: enrollment.id,
			role: enrollment.role,
			status: enrollment.status,
			createdAt: enrollment.createdAt,
			userId: user.id,
			name: user.name,
			email: user.email
		})
		.from(enrollment)
		.innerJoin(user, eq(user.id, enrollment.userId))
		.where(and(...conditions))
		.orderBy(sql`${enrollment.role} = 'student'`, asc(user.name));
}

/** Headline counts for a course's enrollment page, ignoring any filters. */
export async function countEnrollments(courseId: string) {
	const [row] = await db
		.select({
			students: sql<number>`count(*) filter (where ${enrollment.role} = 'student' and ${enrollment.status} = 'active')::int`,
			teachers: sql<number>`count(*) filter (where ${enrollment.role} = 'teacher' and ${enrollment.status} = 'active')::int`,
			suspended: sql<number>`count(*) filter (where ${enrollment.status} = 'suspended')::int`
		})
		.from(enrollment)
		.where(eq(enrollment.courseId, courseId));
	return row;
}

export async function findUserIdByEmail(email: string) {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(sql`lower(${user.email})`, email.toLowerCase()))
		.limit(1);
	return row?.id ?? null;
}

export class EnrollmentError extends Error {}

export async function enrollUser(courseId: string, userId: string, role: EnrollmentRole) {
	try {
		const [row] = await db.insert(enrollment).values({ courseId, userId, role }).returning();
		return row;
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new EnrollmentError('That user is already enrolled in this course.');
		}
		throw err;
	}
}

/** Updates an enrollment, scoped to the course so ids from other courses can't be touched. */
export async function updateEnrollment(
	courseId: string,
	enrollmentId: string,
	changes: { role?: EnrollmentRole; status?: EnrollmentStatus }
) {
	const [row] = await db
		.update(enrollment)
		.set(changes)
		.where(and(eq(enrollment.id, enrollmentId), eq(enrollment.courseId, courseId)))
		.returning({ id: enrollment.id });
	return Boolean(row);
}

export async function removeEnrollment(courseId: string, enrollmentId: string) {
	const [row] = await db
		.delete(enrollment)
		.where(and(eq(enrollment.id, enrollmentId), eq(enrollment.courseId, courseId)))
		.returning({ id: enrollment.id });
	return Boolean(row);
}

/** Students in a course (any status), for reports. */
export async function listStudents(courseId: string) {
	return db
		.select({ userId: user.id, name: user.name, email: user.email, status: enrollment.status })
		.from(enrollment)
		.innerJoin(user, eq(user.id, enrollment.userId))
		.where(and(eq(enrollment.courseId, courseId), eq(enrollment.role, 'student')))
		.orderBy(asc(user.name));
}

/** Every active student enrollment in a visible course, for scheduled jobs. */
export async function activeStudentEnrollments() {
	return db
		.select({
			userId: enrollment.userId,
			enrolledAt: enrollment.createdAt,
			courseId: course.id,
			title: course.title,
			slug: course.slug
		})
		.from(enrollment)
		.innerJoin(course, eq(course.id, enrollment.courseId))
		.where(
			and(eq(enrollment.role, 'student'), eq(enrollment.status, 'active'), eq(course.visible, true))
		);
}
