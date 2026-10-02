<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const tabs = $derived(
		[
			{ href: '/admin/courses', label: 'Courses', show: true },
			{ href: '/admin/categories', label: 'Categories', show: data.adminCaps['categories:manage'] },
			{ href: '/admin/users', label: 'Users', show: data.adminCaps['users:view'] }
		].filter((t) => t.show)
	);
</script>

<div class="admin">
	<nav aria-label="Administration">
		<p class="label">Admin</p>
		<ul>
			{#each tabs as tab (tab.href)}
				<li>
					<a
						href={tab.href}
						aria-current={page.url.pathname.startsWith(tab.href) ? 'page' : undefined}
					>
						{tab.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.admin {
		display: grid;
		gap: var(--space-l);
		grid-template-columns: 1fr;

		@media (min-width: 52rem) {
			grid-template-columns: 11rem 1fr;
		}
	}

	.label {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		margin-block-end: var(--space-2xs);
	}

	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);

		@media (min-width: 52rem) {
			flex-direction: column;
		}
	}

	a {
		display: block;
		padding: var(--space-2xs) var(--space-s);
		border-radius: var(--radius-s);
		text-decoration: none;
		color: var(--color-text);

		&:hover {
			background: var(--color-surface-2);
		}

		&[aria-current='page'] {
			background: var(--color-surface-2);
			color: var(--color-primary);
			font-weight: 600;
		}
	}

	.content {
		min-width: 0;
	}
</style>
