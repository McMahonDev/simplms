/**
 * Better Auth options shared by the running app (auth.ts) and the Better Auth CLI
 * (better-auth.config.ts, used only to generate the Drizzle schema).
 *
 * Keep this file free of `$app/*` imports so the CLI can load it.
 */
import type { BetterAuthOptions } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

export const SITE_ROLES = ['admin', 'manager', 'user'] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

/**
 * Access control for Better Auth's own admin endpoints (create user, set role, ban).
 * App-level capabilities live in permissions.ts; this only mirrors the "manage users"
 * row so the admin plugin enforces the same rule at its API boundary.
 */
const ac = createAccessControl(defaultStatements);

export const adminPlugin = admin({
	ac,
	roles: {
		admin: ac.newRole(adminAc.statements),
		// Managers can view users but not change them.
		manager: ac.newRole({ user: ['list', 'get'] }),
		user: ac.newRole(userAc.statements)
	},
	adminRoles: ['admin'],
	defaultRole: 'user'
});

export const baseAuthOptions = {
	appName: 'SimpLMS',
	emailAndPassword: { enabled: true, minPasswordLength: 8 },
	advanced: {
		database: { generateId: 'uuid' }
	}
} satisfies Partial<BetterAuthOptions>;
