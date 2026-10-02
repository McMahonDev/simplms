import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from './index.js';
import { enrollment, user } from './schema.js';
import { likeTerm } from './utils.js';

export type UserFilters = { q?: string; role?: 'admin' | 'manager' | 'user' };

/** Users for the admin list, with a count of their enrollments. Capped at 500 rows. */
export async function listUsers(filters: UserFilters = {}) {
	const roleFilter =
		filters.role === 'user'
			? or(eq(user.role, 'user'), sql`${user.role} is null`)
			: filters.role
				? eq(user.role, filters.role)
				: undefined;

	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			createdAt: user.createdAt,
			enrollments: sql<number>`(select count(*)::int from ${enrollment} where ${enrollment.userId} = ${user.id})`
		})
		.from(user)
		.where(
			and(
				filters.q
					? or(ilike(user.name, likeTerm(filters.q)), ilike(user.email, likeTerm(filters.q)))
					: undefined,
				roleFilter
			)
		)
		.orderBy(asc(user.name))
		.limit(500);
}
