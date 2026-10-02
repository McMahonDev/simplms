import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { type EnrollmentRole, type EnrollmentStatus, enrollment, user } from './schema.js';
import { isUniqueViolation } from './utils.js';

export async function listEnrollments(courseId: string) {
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
		.where(eq(enrollment.courseId, courseId))
		.orderBy(sql`${enrollment.role} = 'student'`, asc(user.name));
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
