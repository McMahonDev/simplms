/**
 * Read-side progress queries shared by the course page, dashboard, and report.
 * "Progress" for a package is the user's latest attempt (highest attempt_number).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { evaluateActivities } from '../completion.js';
import { db } from './index.js';
import {
	type CompletionStatus,
	type SuccessStatus,
	activityPrerequisite,
	course,
	enrollment,
	scormAttempt,
	scormPackage
} from './schema.js';

export type AttemptSummary = {
	packageId: string;
	userId: string;
	attemptNumber: number;
	completionStatus: CompletionStatus;
	successStatus: SuccessStatus;
	scoreRaw: number | null;
	totalTime: number;
	lastAccessedAt: Date | null;
};

const attemptColumns = {
	packageId: scormAttempt.packageId,
	userId: scormAttempt.userId,
	attemptNumber: scormAttempt.attemptNumber,
	completionStatus: scormAttempt.completionStatus,
	successStatus: scormAttempt.successStatus,
	scoreRaw: scormAttempt.scoreRaw,
	totalTime: scormAttempt.totalTime,
	lastAccessedAt: scormAttempt.lastAccessedAt
};

/** Keeps only the highest attempt per (package, user). */
function latestOnly(rows: AttemptSummary[]): Map<string, AttemptSummary> {
	const latest = new Map<string, AttemptSummary>();
	for (const row of rows) {
		const key = `${row.packageId}:${row.userId}`;
		const seen = latest.get(key);
		if (!seen || row.attemptNumber > seen.attemptNumber) latest.set(key, row);
	}
	return latest;
}

/** A course's activities in order, with their completion rules and prerequisites. */
export async function listPackages(courseId: string) {
	return packagesForCourses([courseId]);
}

/** Latest attempts for the given users across the given packages, keyed "packageId:userId". */
export async function latestAttempts(packageIds: string[], userIds: string[]) {
	if (packageIds.length === 0 || userIds.length === 0) return new Map<string, AttemptSummary>();
	const rows = await db
		.select(attemptColumns)
		.from(scormAttempt)
		.where(and(inArray(scormAttempt.packageId, packageIds), inArray(scormAttempt.userId, userIds)));
	return latestOnly(rows);
}

/** The course's packages, each with this user's latest attempt (if any). */
export async function packagesWithProgress(courseId: string, userId: string) {
	const packages = await listPackages(courseId);
	const attempts = await latestAttempts(
		packages.map((p) => p.id),
		[userId]
	);
	const states = evaluateActivities(packages, (id) => attempts.get(`${id}:${userId}`));
	return packages.map((p) => ({
		...p,
		attempt: attempts.get(`${p.id}:${userId}`) ?? null,
		...states.get(p.id)!
	}));
}

/** The user's active enrollments with course info, for the dashboard. */
export async function myEnrollments(userId: string) {
	return db
		.select({
			courseId: course.id,
			title: course.title,
			slug: course.slug,
			summary: course.summary,
			visible: course.visible,
			role: enrollment.role,
			status: enrollment.status
		})
		.from(enrollment)
		.innerJoin(course, eq(course.id, enrollment.courseId))
		.where(and(eq(enrollment.userId, userId), eq(enrollment.status, 'active')))
		.orderBy(asc(course.title));
}

/** Activities for several courses at once, in course order, with rules and prerequisites. */
export async function packagesForCourses(courseIds: string[]) {
	if (courseIds.length === 0) return [];
	const rows = await db
		.select({
			id: scormPackage.id,
			courseId: scormPackage.courseId,
			title: scormPackage.title,
			version: scormPackage.version,
			sortOrder: scormPackage.sortOrder,
			createdAt: scormPackage.createdAt,
			completionRule: scormPackage.completionRule,
			completionMinScore: scormPackage.completionMinScore
		})
		.from(scormPackage)
		.where(inArray(scormPackage.courseId, courseIds))
		.orderBy(asc(scormPackage.sortOrder), asc(scormPackage.createdAt));
	if (rows.length === 0) return [];

	const prerequisites = await db
		.select()
		.from(activityPrerequisite)
		.where(
			inArray(
				activityPrerequisite.packageId,
				rows.map((r) => r.id)
			)
		);
	return rows.map((r) => ({
		...r,
		requires: prerequisites.filter((p) => p.packageId === r.id).map((p) => p.requiredPackageId)
	}));
}
