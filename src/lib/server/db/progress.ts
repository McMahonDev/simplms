/**
 * Read-side progress queries shared by the course page, dashboard, and report.
 * Every attempt is loaded: an activity is complete when any attempt meets its rule.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
	canStartNewAttempt,
	evaluateActivities,
	isFinished,
	resultAttempt,
	resultOf
} from '../completion.js';
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

/** Attempts for each (package, user), keyed "packageId:userId", in attempt order. */
export type AttemptHistory = Map<string, AttemptSummary[]>;

/** A course's activities in order, with their completion rules and prerequisites. */
export async function listPackages(courseId: string) {
	return packagesForCourses([courseId]);
}

/** Every attempt by the given users on the given packages, keyed "packageId:userId". */
export async function attemptHistory(
	packageIds: string[],
	userIds: string[]
): Promise<AttemptHistory> {
	const history: AttemptHistory = new Map();
	if (packageIds.length === 0 || userIds.length === 0) return history;
	const rows = await db
		.select(attemptColumns)
		.from(scormAttempt)
		.where(and(inArray(scormAttempt.packageId, packageIds), inArray(scormAttempt.userId, userIds)))
		.orderBy(asc(scormAttempt.attemptNumber));
	for (const row of rows) {
		const key = `${row.packageId}:${row.userId}`;
		history.set(key, [...(history.get(key) ?? []), row]);
	}
	return history;
}

/** The course's packages, each with this user's latest attempt (if any). */
export async function packagesWithProgress(courseId: string, userId: string) {
	const packages = await listPackages(courseId);
	const history = await attemptHistory(
		packages.map((p) => p.id),
		[userId]
	);
	const attemptsOf = (id: string) => history.get(`${id}:${userId}`) ?? [];
	const states = evaluateActivities(packages, attemptsOf);
	return packages.map((p) => {
		const attempts = attemptsOf(p.id);
		const shown = resultAttempt(attempts, p);
		return {
			...p,
			...states.get(p.id)!,
			attemptCount: attempts.length,
			latest: attempts.at(-1) ?? null,
			/** The latest attempt is over, so relaunching opens it in review mode. */
			finished: attempts.length > 0 && isFinished(attempts.at(-1)!),
			canRetake: canStartNewAttempt(attempts, p.maxAttempts),
			/** The attempt that counts: the first that met the rule, else the latest. */
			attempt: shown,
			result: shown ? resultOf(shown, p) : null
		};
	});
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
			completionMinScore: scormPackage.completionMinScore,
			maxAttempts: scormPackage.maxAttempts
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
