<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { resultFor } from '#lib/forms.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const details = $derived(resultFor(form, 'details'));
	const enrolled = $derived(resultFor(form, 'enroll'));
	const enrollmentResult = $derived(
		resultFor(form, 'updateEnrollment') ?? resultFor(form, 'unenroll')
	);
</script>

<svelte:head><title>Manage {data.course.title} · SimpLMS</title></svelte:head>

<div class="stack">
	<nav aria-label="Breadcrumb" class="muted crumbs">
		<a href="/courses/{data.course.slug}">{data.course.title}</a> › Manage
	</nav>
	<h1>Manage course</h1>

	<section class="card stack" aria-labelledby="details-heading">
		<h2 id="details-heading">Details</h2>
		<form method="POST" action="?/details" use:enhance class="grid-form">
			{#if details?.message}
				<p class="alert {details.ok ? 'success' : 'error'} wide" role="status">
					{details.message}
				</p>
			{/if}
			<label>
				Title
				<input name="title" required maxlength="200" value={data.course.title} />
				<FieldError errors={details?.errors?.title} />
			</label>
			<label>
				Slug
				<input name="slug" maxlength="80" value={data.course.slug} />
				<FieldError errors={details?.errors?.slug} />
			</label>
			<label>
				Category
				<select name="categoryId" required>
					{#each data.categories as c (c.id)}
						<option value={c.id} selected={c.id === data.course.categoryId}>
							{'— '.repeat(c.depth)}{c.name}
						</option>
					{/each}
				</select>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="visible" checked={data.course.visible} />
				Visible to learners
			</label>
			<label class="wide">
				Summary
				<textarea name="summary" rows="4">{data.course.summary}</textarea>
			</label>
			<div class="wide"><button type="submit">Save details</button></div>
		</form>
	</section>

	{#if data.caps['course:enrollments:manage']}
		<section class="card stack" aria-labelledby="enrollments-heading">
			<h2 id="enrollments-heading">Enrollments</h2>

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
			{#if enrollmentResult?.message && !enrollmentResult.ok}
				<p class="alert error" role="alert">{enrollmentResult.message}</p>
			{/if}

			{#if data.enrollments.length === 0}
				<EmptyState title="Nobody is enrolled yet">
					<p>Add learners and teachers by email above.</p>
				</EmptyState>
			{:else}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th scope="col">Person</th>
								<th scope="col">Role and status</th>
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
										<form method="POST" action="?/updateEnrollment" use:enhance class="cluster">
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
									<td class="remove">
										<form method="POST" action="?/unenroll" use:enhance>
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
	{/if}

	{#if data.caps['course:delete']}
		<section class="card stack danger-zone" aria-labelledby="delete-heading">
			<h2 id="delete-heading">Delete course</h2>
			<p class="muted">
				Removes the course, its enrollments, SCORM activities, and all learner progress. This cannot
				be undone.
			</p>
			<form method="POST" action="?/delete" class="cluster">
				<label class="checkbox">
					<input type="checkbox" name="confirm" required />
					I understand this deletes all learner progress
				</label>
				<button type="submit" class="danger">Delete course</button>
			</form>
		</section>
	{/if}
</div>

<style>
	.crumbs {
		font-size: var(--text-s);
	}

	.grid-form {
		display: grid;
		gap: var(--space-s);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));

		& .wide {
			grid-column: 1 / -1;
		}
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		align-self: end;
		padding-block-end: var(--space-xs);
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

	.you {
		margin-inline-start: var(--space-2xs);
	}

	.email {
		font-size: var(--text-xs);
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

	.danger-zone {
		border-color: var(--color-danger);
	}
</style>
