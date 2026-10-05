/**
 * Read-side progress queries shared by the course page, dashboard, and report.
 * Every attempt is loaded: an activity is complete when any attempt meets its rule.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
	attemptsAllowed,
	canStartNewAttempt,
	evaluateActivities,
	isFinished,
	resultAttempt,
	resultOf
} from '../completion.js';
import { attemptGrants } from './attempts.js';
import { db } from './index.js';
import {
	type CompletionStatus,
	type SuccessStatus,
	activity,
	activityAttempt,
	activityPrerequisite,
	course,
	enrollment,
	scormPackage
} from './schema.js';

export type AttemptSummary = {
	activityId: string;
	userId: string;
	attemptNumber: number;
	completionStatus: CompletionStatus;
	successStatus: SuccessStatus;
	scoreRaw: number | null;
	totalTime: number;
	lastAccessedAt: Date | null;
};

const attemptColumns = {
	activityId: activityAttempt.activityId,
	userId: activityAttempt.userId,
	attemptNumber: activityAttempt.attemptNumber,
	completionStatus: activityAttempt.completionStatus,
	successStatus: activityAttempt.successStatus,
	scoreRaw: activityAttempt.scoreRaw,
	totalTime: activityAttempt.totalTime,
	lastAccessedAt: activityAttempt.lastAccessedAt
};

/** Attempts for each (activity, user), keyed "activityId:userId", in attempt order. */
export type AttemptHistory = Map<string, AttemptSummary[]>;

/** A course's activities in order, with their completion rules and prerequisites. */
export async function listActivities(courseId: string) {
	return activitiesForCourses([courseId]);
}

/** Every attempt by the given users at the given activities, keyed "activityId:userId". */
export async function attemptHistory(
	activityIds: string[],
	userIds: string[]
): Promise<AttemptHistory> {
	const history: AttemptHistory = new Map();
	if (activityIds.length === 0 || userIds.length === 0) return history;
	const rows = await db
		.select(attemptColumns)
		.from(activityAttempt)
		.where(
			and(
				inArray(activityAttempt.activityId, activityIds),
				inArray(activityAttempt.userId, userIds)
			)
		)
		.orderBy(asc(activityAttempt.attemptNumber));
	for (const row of rows) {
		const key = `${row.activityId}:${row.userId}`;
		history.set(key, [...(history.get(key) ?? []), row]);
	}
	return history;
}

/** The course's activities, each with this user's attempts, completion, and lock state. */
export async function activitiesWithProgress(courseId: string, userId: string) {
	const activities = await listActivities(courseId);
	const ids = activities.map((a) => a.id);
	const [history, grants] = await Promise.all([
		attemptHistory(ids, [userId]),
		attemptGrants(ids, [userId])
	]);
	const attemptsOf = (id: string) => history.get(`${id}:${userId}`) ?? [];
	const states = evaluateActivities(activities, attemptsOf);
	return activities.map((p) => {
		const attempts = attemptsOf(p.id);
		const shown = resultAttempt(attempts, p);
		const allowed = attemptsAllowed(p.maxAttempts, grants.get(`${p.id}:${userId}`));
		return {
			...p,
			...states.get(p.id)!,
			attemptCount: attempts.length,
			latest: attempts.at(-1) ?? null,
			/** The latest attempt is over, so relaunching opens it in review mode. */
			finished: attempts.length > 0 && isFinished(attempts.at(-1)!),
			/** The limit plus attempts a teacher granted this learner; null means unlimited. */
			attemptsAllowed: allowed,
			canRetake: canStartNewAttempt(attempts, allowed),
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
export async function activitiesForCourses(courseIds: string[]) {
	if (courseIds.length === 0) return [];
	const rows = await db
		.select({
			id: activity.id,
			courseId: activity.courseId,
			type: activity.type,
			title: activity.title,
			/** Only SCORM activities have a version. */
			version: scormPackage.version,
			sortOrder: activity.sortOrder,
			createdAt: activity.createdAt,
			completionRule: activity.completionRule,
			completionMinScore: activity.completionMinScore,
			maxAttempts: activity.maxAttempts
		})
		.from(activity)
		.leftJoin(scormPackage, eq(scormPackage.activityId, activity.id))
		.where(inArray(activity.courseId, courseIds))
		.orderBy(asc(activity.sortOrder), asc(activity.createdAt));
	if (rows.length === 0) return [];

	const prerequisites = await db
		.select()
		.from(activityPrerequisite)
		.where(
			inArray(
				activityPrerequisite.activityId,
				rows.map((r) => r.id)
			)
		);
	return rows.map((r) => ({
		...r,
		requires: prerequisites.filter((p) => p.activityId === r.id).map((p) => p.requiredActivityId)
	}));
}
