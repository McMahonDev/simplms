/**
 * Version-neutral helpers for SCORM runtime (CMI) data: time formats, status mapping,
 * and the state handed back to scorm-again on relaunch. Pure functions, no I/O.
 *
 * References:
 * - SCORM 1.2 RTE section 3.4 (Data model: cmi.core.*):
 *   https://adlnet.gov/projects/scorm-1-2/  (SCORM_1.2_RunTimeEnv.pdf)
 * - SCORM 2004 4th Ed. RTE section 4.2 (Run-time data model):
 *   https://adlnet.gov/projects/scorm-2004-4th-edition/  (SCORM_2004_4ED_v1_1_RTE.pdf)
 * - Rustici, "SCORM run-time reference":
 *   https://scorm.com/scorm-explained/technical-scorm/run-time/run-time-reference/
 */
import type { CompletionStatus, ScormVersion, SuccessStatus } from '../db/schema.js';

type Cmi = Record<string, unknown>;

export type NormalizedCommit = {
	completionStatus: CompletionStatus;
	successStatus: SuccessStatus;
	scoreRaw: number | null;
	/** Duration of the current session in seconds, or null if the SCO didn't report one. */
	sessionSeconds: number | null;
};

const get = (obj: unknown, ...keys: string[]): unknown => {
	let cur = obj;
	for (const k of keys) {
		if (!cur || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[k];
	}
	return cur;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function toScore(v: unknown): number | null {
	const s = typeof v === 'number' ? String(v) : str(v);
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

/**
 * Parses SCORM 1.2 CMITimespan "HHHH:MM:SS.SS" (RTE 3.4.2, data type CMITimespan).
 * Hours are 2-4 digits; fractional seconds are optional.
 */
export function parseScorm12Time(value: string): number | null {
	const m = /^(\d{2,4}):([0-5]?\d):([0-5]?\d(?:\.\d{1,2})?)$/.exec(value.trim());
	if (!m) return null;
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Parses SCORM 2004 timeinterval, an ISO 8601 duration such as "PT1H2M3.5S" or "P1DT2H"
 * (RTE 4.1.1.6, characterstring timeinterval (second,10,2)). Years and months use
 * 365 and 30 days, which is what other LMSs do; SCOs rarely report them.
 */
export function parseIso8601Duration(value: string): number | null {
	const m =
		/^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
			value.trim()
		);
	if (!m || value.trim() === 'P' || value.trim().endsWith('T')) return null;
	const [, y, mo, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
	return y * 365 * 86400 + mo * 30 * 86400 + d * 86400 + h * 3600 + mi * 60 + s;
}

/** Seconds to SCORM 1.2 CMITimespan, e.g. 3725.5 -> "0001:02:05.50". */
export function formatScorm12Time(totalSeconds: number): string {
	const centis = Math.round(Math.max(0, totalSeconds) * 100);
	const hours = Math.min(9999, Math.floor(centis / 360000));
	const minutes = Math.floor((centis % 360000) / 6000);
	const seconds = (centis % 6000) / 100;
	return `${String(hours).padStart(4, '0')}:${String(minutes).padStart(2, '0')}:${seconds
		.toFixed(2)
		.padStart(5, '0')}`;
}

/** Seconds to an ISO 8601 duration, e.g. 3725.5 -> "PT1H2M5.5S". */
export function formatIso8601Duration(totalSeconds: number): string {
	const centis = Math.round(Math.max(0, totalSeconds) * 100);
	const hours = Math.floor(centis / 360000);
	const minutes = Math.floor((centis % 360000) / 6000);
	const seconds = (centis % 6000) / 100;
	return `PT${hours}H${minutes}M${seconds}S`;
}

/**
 * Maps SCORM 1.2 cmi.core.lesson_status onto 2004's separate completion and success statuses,
 * the same way Rustici's SCORM Engine does, so reports treat both versions alike:
 *   passed -> completed/passed, failed -> completed/failed, completed -> completed/unknown,
 *   incomplete and browsed -> incomplete/unknown, not attempted -> not attempted/unknown.
 */
export function mapLessonStatus(lessonStatus: string): {
	completionStatus: CompletionStatus;
	successStatus: SuccessStatus;
} {
	switch (lessonStatus) {
		case 'passed':
			return { completionStatus: 'completed', successStatus: 'passed' };
		case 'failed':
			return { completionStatus: 'completed', successStatus: 'failed' };
		case 'completed':
			return { completionStatus: 'completed', successStatus: 'unknown' };
		case 'incomplete':
		case 'browsed':
			return { completionStatus: 'incomplete', successStatus: 'unknown' };
		case 'not attempted':
			return { completionStatus: 'not attempted', successStatus: 'unknown' };
		default:
			return { completionStatus: 'unknown', successStatus: 'unknown' };
	}
}

const COMPLETION_2004 = new Set<CompletionStatus>([
	'completed',
	'incomplete',
	'not attempted',
	'unknown'
]);
const SUCCESS_2004 = new Set<SuccessStatus>(['passed', 'failed', 'unknown']);

/** Pulls the reporting fields out of a committed CMI object. */
export function normalizeCommit(version: ScormVersion, cmi: Cmi): NormalizedCommit {
	if (version === '1.2') {
		const sessionTime = str(get(cmi, 'core', 'session_time'));
		return {
			...mapLessonStatus(str(get(cmi, 'core', 'lesson_status'))),
			scoreRaw: toScore(get(cmi, 'core', 'score', 'raw')),
			sessionSeconds: sessionTime ? parseScorm12Time(sessionTime) : null
		};
	}

	const completion = str(get(cmi, 'completion_status')) as CompletionStatus;
	const success = str(get(cmi, 'success_status')) as SuccessStatus;
	const sessionTime = str(get(cmi, 'session_time'));
	return {
		completionStatus: COMPLETION_2004.has(completion) ? completion : 'unknown',
		successStatus: SUCCESS_2004.has(success) ? success : 'unknown',
		scoreRaw: toScore(get(cmi, 'score', 'raw')),
		sessionSeconds: sessionTime ? parseIso8601Duration(sessionTime) : null
	};
}

/** Recursively drops keys scorm-again renders but won't accept back (_children, _count, ...). */
function stripMeta(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripMeta);
	if (!value || typeof value !== 'object') return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) {
		if (k.startsWith('_') || v === null || v === '') continue;
		out[k] = stripMeta(v);
	}
	return out;
}

export type Learner = { id: string; name: string };

/**
 * Builds the CMI object to load into scorm-again before Initialize so the learner resumes.
 *
 * - entry is "resume" when the last session exited with "suspend", otherwise "" (1.2 RTE
 *   3.4.4 cmi.core.entry; 2004 RTE 4.2.8 cmi.entry). First launches get "ab-initio".
 * - total_time comes from our accumulated column, not the stored CMI.
 * - Write-only elements (exit, session_time) are not replayed. SCORM 1.2 interactions are
 *   write-only too (RTE 3.4.4 cmi.interactions), so they're dropped for 1.2.
 */
export function buildLaunchCmi(
	version: ScormVersion,
	stored: Cmi,
	totalSeconds: number,
	learner: Learner
): { cmi: Cmi } {
	const cmi = structuredClone((stripMeta(stored) ?? {}) as Cmi);
	const firstLaunch = Object.keys(cmi).length === 0;

	if (version === '1.2') {
		const core = ((cmi.core as Cmi | undefined) ?? {}) as Cmi;
		const lastExit = str(core.exit);
		delete core.exit;
		delete core.session_time;
		delete core.total_time;
		delete core.entry;
		delete cmi.interactions;
		core.student_id = learner.id;
		core.student_name = learner.name;
		core.entry = firstLaunch ? 'ab-initio' : lastExit === 'suspend' ? 'resume' : '';
		core.total_time = formatScorm12Time(totalSeconds);
		cmi.core = core;
		return { cmi };
	}

	const lastExit = str(cmi.exit);
	delete cmi.exit;
	delete cmi.session_time;
	delete cmi.total_time;
	delete cmi.entry;
	cmi.learner_id = learner.id;
	cmi.learner_name = learner.name;
	cmi.entry = firstLaunch ? 'ab-initio' : lastExit === 'suspend' ? 'resume' : '';
	cmi.total_time = formatIso8601Duration(totalSeconds);
	return { cmi };
}
