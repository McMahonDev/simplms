<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = $derived([
		{ href: '/', label: 'Dashboard' },
		{ href: '/courses', label: 'Courses' },
		...(data.nav.admin ? [{ href: '/admin', label: 'Admin' }] : [])
	]);

	function isCurrent(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header>
	<div class="inner">
		<a class="brand" href="/">SimpLMS</a>
		<nav aria-label="Main">
			<ul>
				{#each links as link (link.href)}
					<li>
						<a href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<div class="account">
			<a
				class="bell"
				href="/notifications"
				aria-current={isCurrent('/notifications') ? 'page' : undefined}
			>
				Notifications
				{#if data.nav.unread > 0}
					<span class="count">{data.nav.unread > 99 ? '99+' : data.nav.unread}</span>
					<span class="visually-hidden">unread</span>
				{/if}
			</a>
			<span class="who" title={data.user.email}>{data.user.name}</span>
			<form method="POST" action="/sign-out">
				<button type="submit" class="secondary small">Sign out</button>
			</form>
		</div>
	</div>
</header>

<main id="main">
	{@render children()}
</main>

<style>
	.skip-link {
		position: absolute;
		left: var(--space-s);
		top: -3rem;
		padding: var(--space-xs) var(--space-s);
		background: var(--color-surface);
		z-index: 10;

		&:focus {
			top: var(--space-s);
		}
	}

	header {
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		z-index: 5;
	}

	.inner {
		max-width: var(--content-width);
		margin-inline: auto;
		padding: var(--space-xs) var(--space-m);
		min-height: var(--header-height);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs) var(--space-l);
	}

	.brand {
		font-weight: 700;
		text-decoration: none;
		color: var(--color-text);
	}

	nav ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		list-style: none;
		padding: 0;
	}

	nav a {
		display: block;
		padding: var(--space-2xs) var(--space-s);
		border-radius: var(--radius-s);
		text-decoration: none;
		color: var(--color-text-muted);
		font-weight: 500;

		&:hover {
			background: var(--color-surface-2);
			color: var(--color-text);
		}

		&[aria-current='page'] {
			color: var(--color-primary);
			background: var(--color-surface-2);
		}
	}

	.account {
		margin-inline-start: auto;
		display: flex;
		align-items: center;
		gap: var(--space-s);
	}

	.who {
		font-size: var(--text-s);
		color: var(--color-text-muted);
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	main {
		max-width: var(--content-width);
		margin-inline: auto;
		padding: var(--space-l) var(--space-m) var(--space-2xl);
	}

	.bell {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);
		font-size: var(--text-s);
		text-decoration: none;
		color: inherit;

		&[aria-current='page'] {
			text-decoration: underline;
		}
	}

	.count {
		min-width: 1.25rem;
		padding: 0 var(--space-3xs);
		border-radius: 999px;
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-size: var(--text-xs);
		font-weight: 700;
		text-align: center;
	}
</style>
