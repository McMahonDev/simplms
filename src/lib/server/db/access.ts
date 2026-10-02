import { and, eq } from 'drizzle-orm';
import { db } from './index.js';
import { course, enrollment } from './schema.js';

/** The course facts the permission check needs: visibility and the user's enrollment. */
export async function getCourseAccessFacts(userId: string, courseId: string) {
	const [row] = await db
		.select({
			visible: course.visible,
			enrollmentRole: enrollment.role,
			enrollmentStatus: enrollment.status
		})
		.from(course)
		.leftJoin(enrollment, and(eq(enrollment.courseId, course.id), eq(enrollment.userId, userId)))
		.where(eq(course.id, courseId))
		.limit(1);

	if (!row) return null;
	return {
		course: { visible: row.visible },
		enrollment:
			row.enrollmentRole && row.enrollmentStatus
				? { role: row.enrollmentRole, status: row.enrollmentStatus }
				: null
	};
}
