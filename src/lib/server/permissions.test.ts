import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteRole } from './auth-options.js';
import {
	type AccessContext,
	type Capability,
	can,
	canSelfEnroll,
	decide,
	siteRoleOf
} from './permissions.js';

vi.mock('./db/access.js', () => ({ getCourseAccessFacts: vi.fn() }));
const { getCourseAccessFacts } = await import('./db/access.js');
const mockedFacts = vi.mocked(getCourseAccessFacts);

type Actor = 'admin' | 'manager' | 'teacher' | 'student';

const visibleCourse = { visible: true };

/** Builds the context each column of the permissions table describes. */
function contextFor(actor: Actor): AccessContext {
	switch (actor) {
		case 'admin':
		case 'manager':
			// Staff with no enrollment in the course.
			return { siteRole: actor, course: visibleCourse, enrollment: null };
		case 'teacher':
			return {
				siteRole: 'user',
				course: visibleCourse,
				enrollment: { role: 'teacher', status: 'active' }
			};
		case 'student':
			return {
				siteRole: 'user',
				course: visibleCourse,
				enrollment: { role: 'student', status: 'active' }
			};
	}
}

/**
 * The permissions table from the spec, one row per capability.
 * Columns: admin, manager, teacher (course), student (course).
 */
const table: [row: string, capability: Capability, expected: Record<Actor, boolean>][] = [
	[
		'Manage users and site roles',
		'users:manage',
		{ admin: true, manager: false, teacher: false, student: false }
	],
	[
		'Manage users: manager has view only',
		'users:view',
		{ admin: true, manager: true, teacher: false, student: false }
	],
	[
		'Manage categories',
		'categories:manage',
		{ admin: true, manager: true, teacher: false, student: false }
	],
	[
		'Create courses',
		'courses:create',
		{ admin: true, manager: true, teacher: false, student: false }
	],
	[
		'Delete courses',
		'course:delete',
		{ admin: true, manager: true, teacher: false, student: false }
	],
	[
		'Edit course details and upload SCORM',
		'course:edit',
		{ admin: true, manager: true, teacher: true, student: false }
	],
	[
		'Manage enrollments in a course',
		'course:enrollments:manage',
		{ admin: true, manager: true, teacher: true, student: false }
	],
	[
		'View course progress reports',
		'course:reports:view',
		{ admin: true, manager: true, teacher: true, student: false }
	],
	[
		'Launch SCORM and see own progress',
		'scorm:launch',
		{ admin: true, manager: true, teacher: true, student: true }
	],
	[
		'View the course page',
		'course:view',
		{ admin: true, manager: true, teacher: true, student: true }
	],
	[
		'Run and inspect scheduled jobs',
		'jobs:manage',
		{ admin: true, manager: false, teacher: false, student: false }
	],
	[
		'Reach the admin area',
		'admin:access',
		{ admin: true, manager: true, teacher: false, student: false }
	]
];

describe('permissions table', () => {
	for (const [row, capability, expected] of table) {
		describe(row, () => {
			for (const actor of Object.keys(expected) as Actor[]) {
				it(`${actor}: ${expected[actor] ? 'allowed' : 'denied'}`, () => {
					expect(decide(capability, contextFor(actor))).toBe(expected[actor]);
				});
			}
		});
	}
});

describe('course-level edge cases', () => {
	const hidden = { visible: false };

	it('hides hidden courses from students', () => {
		const ctx: AccessContext = {
			siteRole: 'user',
			course: hidden,
			enrollment: { role: 'student', status: 'active' }
		};
		expect(decide('course:view', ctx)).toBe(false);
		expect(decide('scorm:launch', ctx)).toBe(false);
	});

	it('shows hidden courses to their teachers, managers, and admins', () => {
		expect(
			decide('course:view', {
				siteRole: 'user',
				course: hidden,
				enrollment: { role: 'teacher', status: 'active' }
			})
		).toBe(true);
		for (const siteRole of ['admin', 'manager'] as SiteRole[]) {
			expect(decide('course:view', { siteRole, course: hidden, enrollment: null })).toBe(true);
		}
	});

	it('denies suspended enrollments', () => {
		for (const role of ['teacher', 'student'] as const) {
			const ctx: AccessContext = {
				siteRole: 'user',
				course: visibleCourse,
				enrollment: { role, status: 'suspended' }
			};
			expect(decide('course:view', ctx)).toBe(false);
			expect(decide('scorm:launch', ctx)).toBe(false);
		}
	});

	it('denies users who are not enrolled', () => {
		const ctx: AccessContext = { siteRole: 'user', course: visibleCourse, enrollment: null };
		expect(decide('course:view', ctx)).toBe(false);
		expect(decide('scorm:launch', ctx)).toBe(false);
	});

	it('denies course capabilities when no course is given', () => {
		expect(decide('course:edit', { siteRole: 'user' })).toBe(false);
	});

	it('never lets a course role grant a site capability', () => {
		expect(decide('courses:create', contextFor('teacher'))).toBe(false);
		expect(decide('categories:manage', contextFor('teacher'))).toBe(false);
	});
});

describe('canSelfEnroll', () => {
	const open = { visible: true, enrollmentMethod: 'open' } as const;

	it('lets anyone without an enrollment join open and key courses', () => {
		expect(canSelfEnroll({ course: open, enrollment: null })).toBe(true);
		expect(canSelfEnroll({ course: { ...open, enrollmentMethod: 'key' }, enrollment: null })).toBe(
			true
		);
	});

	it('refuses courses that only staff can assign', () => {
		expect(
			canSelfEnroll({ course: { ...open, enrollmentMethod: 'manual' }, enrollment: null })
		).toBe(false);
	});

	it('refuses hidden courses', () => {
		expect(canSelfEnroll({ course: { ...open, visible: false }, enrollment: null })).toBe(false);
	});

	it('refuses people who are already enrolled, including suspended learners', () => {
		for (const status of ['active', 'suspended'] as const) {
			expect(canSelfEnroll({ course: open, enrollment: { role: 'student', status } })).toBe(false);
		}
	});
});

describe('siteRoleOf', () => {
	it('reads the admin plugin role field', () => {
		expect(siteRoleOf({ role: 'admin' })).toBe('admin');
		expect(siteRoleOf({ role: 'manager' })).toBe('manager');
		expect(siteRoleOf({ role: 'user' })).toBe('user');
	});

	it('picks the most privileged of multiple roles', () => {
		expect(siteRoleOf({ role: 'user,manager' })).toBe('manager');
		expect(siteRoleOf({ role: 'manager, admin' })).toBe('admin');
	});

	it('treats missing or unknown roles as user', () => {
		expect(siteRoleOf({ role: null })).toBe('user');
		expect(siteRoleOf({})).toBe('user');
		expect(siteRoleOf({ role: 'superuser' })).toBe('user');
	});
});

describe('can()', () => {
	const courseId = '00000000-0000-4000-8000-000000000001';

	beforeEach(() => mockedFacts.mockReset());

	it('denies anonymous users', async () => {
		expect(await can(null, 'course:view', courseId)).toBe(false);
	});

	it('lets site roles decide without a database lookup', async () => {
		expect(await can({ id: 'a', role: 'admin' }, 'course:edit', courseId)).toBe(true);
		expect(await can({ id: 'm', role: 'manager' }, 'categories:manage')).toBe(true);
		expect(mockedFacts).not.toHaveBeenCalled();
	});

	it('loads enrollment facts for course capabilities', async () => {
		mockedFacts.mockResolvedValue({
			course: { visible: true },
			enrollment: { role: 'teacher', status: 'active' }
		});
		expect(await can({ id: 't', role: 'user' }, 'course:edit', courseId)).toBe(true);
		expect(mockedFacts).toHaveBeenCalledWith('t', courseId);
	});

	it('denies when the course does not exist', async () => {
		mockedFacts.mockResolvedValue(null);
		expect(await can({ id: 's', role: 'user' }, 'course:view', courseId)).toBe(false);
	});

	it('denies course capabilities without a course id for plain users', async () => {
		expect(await can({ id: 't', role: 'user' }, 'course:edit')).toBe(false);
		expect(mockedFacts).not.toHaveBeenCalled();
	});
});
