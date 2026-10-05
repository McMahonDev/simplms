<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { formatDateTime } from '#lib/format.js';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const methodResult = $derived(resultFor(form, 'setMethod'));
	// Follows the saved method until the teacher picks another radio.
	let pickedMethod = $state<string | null>(null);
	const method = $derived(pickedMethod ?? methodResult?.values?.method ?? data.method.method);
	const enrolled = $derived(resultFor(form, 'enroll'));
	const enrollmentResult = $derived(
		resultFor(form, 'updateEnrollment') ?? resultFor(form, 'unenroll')
	);
	const filtered = $derived(Boolean(data.filters.q || data.filters.role || data.filters.status));
	/** Form action URL that keeps the current filters, so the list stays filtered after a change. */
	function actionUrl(name: string) {
		const query = Object.entries(data.filters)
			.filter(([, value]) => value)
			.map(([key, value]) => `${key}=${encodeURIComponent(value!)}`);
		return `?${[...query, `/${name}`].join('&')}`;
	}
	const total = $derived(data.counts.students + data.counts.teachers + data.counts.suspended);
</script>

<svelte:head><title>Enrollments · {data.course.title} · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/courses/{data.course.slug}">{data.course.title}</a> › Enrollments
	</nav>
	<h1>Enrollments</h1>

	<p class="muted">
		{data.counts.students} active student{data.counts.students === 1 ? '' : 's'} ·
		{data.counts.teachers} teacher{data.counts.teachers === 1 ? '' : 's'}
		{#if data.counts.suspended > 0}· {data.counts.suspended} suspended{/if}
	</p>

	<section class="card stack" aria-labelledby="method-heading">
		<h2 id="method-heading">Enrollment method</h2>
		<form
			method="POST"
			action="?/setMethod"
			class="stack"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					pickedMethod = null;
				}}
		>
			<fieldset class="methods">
				<legend class="visually-hidden">Who can join this course</legend>
				<label class="method">
					<input
						type="radio"
						name="method"
						value="manual"
						checked={method === 'manual'}
						onchange={() => (pickedMethod = 'manual')}
					/>
					<span>
						<strong>Assigned only</strong>
						<span class="muted">Only teachers and staff can add people.</span>
					</span>
				</label>
				<label class="method">
					<input
						type="radio"
						name="method"
						value="open"
						checked={method === 'open'}
						onchange={() => (pickedMethod = 'open')}
					/>
					<span>
						<strong>Open</strong>
						<span class="muted">Anyone signed in can join as a student.</span>
					</span>
				</label>
				<label class="method">
					<input
						type="radio"
						name="method"
						value="key"
						checked={method === 'key'}
						onchange={() => (pickedMethod = 'key')}
					/>
					<span>
						<strong>Enrollment code</strong>
						<span class="muted">People join as students by entering a code you give them.</span>
					</span>
				</label>
			</fieldset>
			{#if method === 'key'}
				<label class="key">
					Enrollment code
					<input
						name="key"
						required
						minlength="4"
						maxlength="100"
						autocomplete="off"
						value={methodResult?.values?.key ?? data.method.key}
					/>
					<FieldError errors={methodResult?.errors?.key} />
				</label>
			{/if}
			{#if !data.course.visible && method !== 'manual'}
				<p class="alert warning">
					This course is hidden, so nobody can join until it is made visible on the manage page.
				</p>
			{/if}
			<div class="cluster">
				<button type="submit">Save method</button>
				{#if methodResult?.ok}
					<span class="badge success" role="status">{methodResult.message}</span>
				{/if}
			</div>
		</form>
	</section>

	<section class="card stack" aria-labelledby="enroll-heading">
		<h2 id="enroll-heading">Enroll someone</h2>
		<form method="POST" action="?/enroll" use:enhance class="enroll-form">
			<label>
				Email
				<input
					type="email"
					name="email"
					required
					autocomplete="off"
					placeholder="learner@example.com"
					value={enrolled && !enrolled.ok ? (enrolled.values?.email ?? '') : ''}
				/>
				<FieldError errors={enrolled?.errors?.email} />
			</label>
			<label>
				Role
				<select name="role">
					<option value="student">Student</option>
					<option value="teacher" selected={enrolled?.values?.role === 'teacher'}>Teacher</option>
				</select>
			</label>
			<button type="submit">Enroll</button>
		</form>
		{#if enrolled?.message}
			<p class="alert {enrolled.ok ? 'success' : 'error'}" role="status">{enrolled.message}</p>
		{/if}
	</section>

	<section class="stack" aria-labelledby="people-heading">
		<h2 id="people-heading">People</h2>

		{#if total > 0}
			<form method="GET" class="filters" role="search" aria-label="Filter enrollments">
				<label>
					Search
					<input type="search" name="q" value={data.filters.q ?? ''} placeholder="Name or email" />
				</label>
				<label>
					Role
					<select name="role">
						<option value="">Any</option>
						<option value="student" selected={data.filters.role === 'student'}>Student</option>
						<option value="teacher" selected={data.filters.role === 'teacher'}>Teacher</option>
					</select>
				</label>
				<label>
					Status
					<select name="status">
						<option value="">Any</option>
						<option value="active" selected={data.filters.status === 'active'}>Active</option>
						<option value="suspended" selected={data.filters.status === 'suspended'}
							>Suspended</option
						>
					</select>
				</label>
				<div class="cluster">
					<button type="submit" class="secondary">Filter</button>
					{#if filtered}<a href="/courses/{data.course.slug}/enrollments">Clear</a>{/if}
				</div>
			</form>
		{/if}

		{#if enrollmentResult?.message && !enrollmentResult.ok}
			<p class="alert error" role="alert">{enrollmentResult.message}</p>
		{/if}

		{#if data.enrollments.length === 0}
			{#if filtered}
				<EmptyState title="Nobody matches these filters" />
			{:else}
				<EmptyState title="Nobody is enrolled yet">
					<p>Add learners and teachers by email above.</p>
				</EmptyState>
			{/if}
		{:else}
			<div class="table-wrap">
				<table>
					<caption class="visually-hidden">People enrolled in {data.course.title}</caption>
					<thead>
						<tr>
							<th scope="col">Person</th>
							<th scope="col">Role and status</th>
							<th scope="col">Enrolled</th>
							<th scope="col"><span class="visually-hidden">Remove</span></th>
						</tr>
					</thead>
					<tbody>
						{#each data.enrollments as e (e.id)}
							<tr class:suspended={e.status === 'suspended'}>
								<td>
									<div>
										{e.name}{#if e.userId === data.currentUserId}
											<span class="muted you">(you)</span>{/if}
									</div>
									<div class="muted email">{e.email}</div>
								</td>
								<td>
									<form
										method="POST"
										action={actionUrl('updateEnrollment')}
										use:enhance
										class="cluster"
									>
										<input type="hidden" name="enrollmentId" value={e.id} />
										<label>
											<span class="visually-hidden">Role for {e.name}</span>
											<select name="role">
												<option value="student" selected={e.role === 'student'}>Student</option>
												<option value="teacher" selected={e.role === 'teacher'}>Teacher</option>
											</select>
										</label>
										<label>
											<span class="visually-hidden">Status for {e.name}</span>
											<select name="status">
												<option value="active" selected={e.status === 'active'}>Active</option>
												<option value="suspended" selected={e.status === 'suspended'}
													>Suspended</option
												>
											</select>
										</label>
										<button type="submit" class="secondary small">
											Save <span class="visually-hidden">changes for {e.name}</span>
										</button>
										{#if resultFor(form, 'updateEnrollment', e.id)?.ok}
											<span class="badge success" role="status">Saved</span>
										{/if}
									</form>
								</td>
								<td class="date">{formatDateTime(e.createdAt)}</td>
								<td class="remove">
									<form method="POST" action={actionUrl('unenroll')} use:enhance>
										<input type="hidden" name="enrollmentId" value={e.id} />
										<button type="submit" class="secondary small">
											Remove <span class="visually-hidden">{e.name}</span>
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	.enroll-form {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: 1fr;
		align-items: end;

		@media (min-width: 40rem) {
			grid-template-columns: 1fr 10rem auto;
		}
	}

	.methods {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-s);
	}

	.method {
		display: flex;
		gap: var(--space-xs);
		align-items: start;

		& input {
			margin-block-start: 0.3em;
		}

		& > span {
			display: grid;
		}
	}

	.key {
		max-width: 24rem;
	}

	.filters {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		align-items: end;
	}

	.you {
		margin-inline-start: var(--space-2xs);
	}

	.email,
	.date {
		font-size: var(--text-xs);
	}

	.date {
		white-space: nowrap;
	}

	tr.suspended td:first-child {
		opacity: 0.65;
	}

	td select {
		width: auto;
	}

	.remove {
		text-align: right;
	}
</style>
