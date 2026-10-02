<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { formatDateTime } from '#lib/format.js';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const created = $derived(resultFor(form, 'create'));
	const filtered = $derived(Boolean(data.filters.q || data.filters.role));
	const roleLabel = { admin: 'Admin', manager: 'Manager', user: 'User' } as const;

	function rowResult(id: string) {
		return (
			resultFor(form, 'setRole', id) ?? resultFor(form, 'ban', id) ?? resultFor(form, 'unban', id)
		);
	}
</script>

<svelte:head><title>Users · Admin · SimpLMS</title></svelte:head>

<div class="stack">
	<h1>Users</h1>
	{#if !data.canManage}
		<p class="alert" role="note">
			You can view users. Only admins can create, change, or ban them.
		</p>
	{/if}

	{#if data.canManage}
		<details class="card" open={created && !created.ok ? true : undefined}>
			<summary>New user</summary>
			<form method="POST" action="?/create" use:enhance class="grid-form">
				{#if created?.message}
					<p class="alert {created.ok ? 'success' : 'error'} wide" role="status">
						{created.message}
					</p>
				{/if}
				<label>
					Name
					<input name="name" required maxlength="120" value={created?.values?.name ?? ''} />
					<FieldError errors={created?.errors?.name} />
				</label>
				<label>
					Email
					<input
						name="email"
						type="email"
						required
						autocomplete="off"
						value={created?.values?.email ?? ''}
					/>
					<FieldError errors={created?.errors?.email} />
				</label>
				<label>
					Temporary password
					<input
						name="password"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
					/>
					<FieldError errors={created?.errors?.password} />
				</label>
				<label>
					Site role
					<select name="role">
						{#each data.roles as role (role)}
							<option value={role} selected={role === (created?.values?.role ?? 'user')}>
								{roleLabel[role]}
							</option>
						{/each}
					</select>
				</label>
				<div class="wide"><button type="submit">Create user</button></div>
			</form>
		</details>
	{/if}

	<form method="GET" class="filters" role="search" aria-label="Filter users">
		<label>
			Search
			<input type="search" name="q" value={data.filters.q ?? ''} placeholder="Name or email" />
		</label>
		<label>
			Role
			<select name="role">
				<option value="">Any</option>
				{#each data.roles as role (role)}
					<option value={role} selected={data.filters.role === role}>{roleLabel[role]}</option>
				{/each}
			</select>
		</label>
		<div class="cluster">
			<button type="submit" class="secondary">Filter</button>
			{#if filtered}<a href="/admin/users">Clear</a>{/if}
		</div>
	</form>

	{#if data.users.length === 0}
		<EmptyState title={filtered ? 'No users match these filters' : 'No users yet'} />
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">User</th>
						<th scope="col">Role</th>
						<th scope="col">Enrollments</th>
						<th scope="col">Joined</th>
						<th scope="col">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as u (u.id)}
						{@const result = rowResult(u.id)}
						{@const isMe = u.id === data.currentUserId}
						<tr>
							<td>
								<div>
									{u.name}{#if isMe}<span class="muted you">(you)</span>{/if}
								</div>
								<div class="muted email">{u.email}</div>
								{#if result?.message}
									<div class="badge {result.ok ? 'success' : 'danger'}" role="status">
										{result.message}
									</div>
								{/if}
							</td>
							<td>
								{#if data.canManage && !isMe}
									<form method="POST" action="?/setRole" use:enhance class="cluster">
										<input type="hidden" name="userId" value={u.id} />
										<label>
											<span class="visually-hidden">Role for {u.name}</span>
											<select name="role">
												{#each data.roles as role (role)}
													<option value={role} selected={u.role === role}>{roleLabel[role]}</option>
												{/each}
											</select>
										</label>
										<button type="submit" class="secondary small">
											Save <span class="visually-hidden">role for {u.name}</span>
										</button>
									</form>
								{:else}
									{roleLabel[u.role]}
								{/if}
							</td>
							<td>{u.enrollments}</td>
							<td class="nowrap">{formatDateTime(u.createdAt)}</td>
							<td>
								{#if u.banned}
									<span class="badge danger" title={u.banReason ?? undefined}>Banned</span>
								{:else}
									<span class="badge success">Active</span>
								{/if}
								{#if data.canManage && !isMe}
									<form
										method="POST"
										action={u.banned ? '?/unban' : '?/ban'}
										use:enhance
										class="inline"
									>
										<input type="hidden" name="userId" value={u.id} />
										<button type="submit" class="secondary small">
											{u.banned ? 'Unban' : 'Ban'}
											<span class="visually-hidden">{u.name}</span>
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.users.length === 500}
			<p class="muted">Showing the first 500 users. Narrow the search to find others.</p>
		{/if}
	{/if}
</div>

<style>
	summary {
		cursor: pointer;
		font-weight: 600;
	}

	.grid-form {
		display: grid;
		gap: var(--space-s);
		margin-block-start: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));

		& .wide {
			grid-column: 1 / -1;
		}
	}

	.filters {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		align-items: end;
	}

	.email {
		font-size: var(--text-xs);
	}

	.you {
		margin-inline-start: var(--space-2xs);
	}

	td select {
		width: auto;
	}

	.inline {
		display: inline-block;
		margin-inline-start: var(--space-xs);
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
