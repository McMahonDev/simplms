/**
 * Demo happy path: a student launches the seeded SCORM 1.2 Golf package, exits halfway,
 * resumes at the same page, completes it, and the completion shows on their dashboard and
 * in the teacher's report. Runs against a freshly seeded e2e database.
 */
import { type Page, expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';

async function signIn(page: Page, email: string) {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
}

async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/sign-in/);
}

test('student resumes and completes a SCORM 1.2 package; teacher sees it', async ({ page }) => {
	// The Golf SCO asks "resume from where you left off?" with confirm().
	page.on('dialog', (dialog) => dialog.accept());

	await signIn(page, 'student1@simplms.test');

	// Dashboard lists only the student's own courses.
	const myCourses = page.getByRole('region', { name: 'My courses' });
	await expect(myCourses.getByRole('heading', { name: 'Golf Fundamentals' })).toBeVisible();
	await expect(myCourses.getByRole('heading', { name: 'Workplace Safety' })).toBeVisible();
	await expect(myCourses.getByText('Data Privacy Basics')).toHaveCount(0);

	// Launch the first activity (SCORM 1.2).
	await myCourses.getByRole('link', { name: 'Start Golf Fundamentals' }).click();
	await expect(page.getByRole('heading', { name: 'Golf Explained (SCORM 1.2)' })).toBeVisible();

	const sco = page.frameLocator('iframe.sco');
	const content = sco.frameLocator('iframe');
	const next = sco.getByRole('button', { name: 'Next ->' });
	await expect(content.getByRole('heading', { level: 1 })).toHaveText('Play of the game');

	// Go three pages in, note where we are, and exit halfway.
	for (let i = 0; i < 3; i++) await next.click();
	const midway = await content.getByRole('heading', { level: 1 }).textContent();
	expect(midway).not.toBe('Play of the game');

	await page.getByRole('button', { name: 'Exit', exact: true }).click();
	await expect(page).toHaveURL(/\/courses\/golf-fundamentals$/);

	// Relaunch and land on the same page.
	await page.getByRole('link', { name: 'Continue Golf Explained (SCORM 1.2)' }).click();
	await expect(content.getByRole('heading', { level: 1 })).toHaveText(midway!);

	// Page through to the end, which marks the SCO completed.
	while (await next.isEnabled()) await next.click();
	await page.getByRole('button', { name: 'Exit', exact: true }).click();
	await expect(page).toHaveURL(/\/courses\/golf-fundamentals$/);

	const activity = page.getByRole('listitem').filter({ hasText: 'Golf Explained (SCORM 1.2)' });
	await expect(activity.getByText('Completed')).toBeVisible();

	await page.getByRole('link', { name: 'Dashboard' }).click();
	await expect(page.getByText('1 of 2 complete')).toBeVisible();

	// The teacher's report shows the completion.
	await signOut(page);
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals/report');
	const row = page.getByRole('row').filter({ hasText: 'Sam Student' });
	await expect(row.getByText('Completed')).toBeVisible();
	await expect(row.getByText('1/2')).toBeVisible();

	// Teachers can't reach the admin area.
	const admin = await page.goto('/admin');
	expect(admin?.status()).toBe(403);
});

test('a student cannot fetch SCORM files from a course they are not in', async ({ page }) => {
	// student1 is enrolled in Golf Fundamentals; student5 is not.
	await signIn(page, 'student1@simplms.test');
	await page.getByRole('link', { name: /^(Start|Continue) Golf Fundamentals$/ }).click();
	const src = await page.locator('iframe.sco').getAttribute('src');
	expect(src).toMatch(/^\/scorm\/content\//);
	await signOut(page);

	await signIn(page, 'student5@simplms.test');
	const response = await page.request.get(src!);
	expect(response.status()).toBe(403);
});

test('a teacher enrolls, suspends, and removes a student on the enrollments page', async ({
	page
}) => {
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals');
	await page.getByRole('link', { name: 'Enrollments' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enrollments');
	await expect(page.getByText('3 active students · 1 teacher')).toBeVisible();

	// Enroll student5, who isn't in the course yet.
	await page.getByLabel('Email').fill('student5@simplms.test');
	await page.getByRole('button', { name: 'Enroll', exact: true }).click();
	await expect(page.getByText('Enrolled student5@simplms.test.')).toBeVisible();
	await expect(page.getByText('4 active students · 1 teacher')).toBeVisible();

	// Search narrows the list to one person; suspend them.
	await page.getByLabel('Search').fill('student5');
	await page.getByRole('button', { name: 'Filter' }).click();
	const rows = page.getByRole('table').getByRole('row');
	await expect(rows).toHaveCount(2);
	const row = rows.filter({ hasText: 'student5@simplms.test' });
	await row.getByLabel(/^Status for/).selectOption('suspended');
	await row.getByRole('button', { name: /^Save/ }).click();
	await expect(row.getByText('Saved')).toBeVisible();
	await expect(page.getByText('3 active students · 1 teacher · 1 suspended')).toBeVisible();

	await row.getByRole('button', { name: /^Remove/ }).click();
	await expect(page.getByText('Nobody matches these filters')).toBeVisible();
	await expect(page.getByText('3 active students · 1 teacher')).toBeVisible();

	// Students can't manage enrollments.
	await signOut(page);
	await signIn(page, 'student1@simplms.test');
	const denied = await page.goto('/courses/golf-fundamentals/enrollments');
	expect(denied?.status()).toBe(403);
});

test('learners join open and code-protected courses but not assigned-only ones', async ({
	page
}) => {
	// student3 is only in Golf Fundamentals. Data Privacy Basics is open; Workplace Safety needs
	// the code SAFETY-2026.
	await signIn(page, 'student3@simplms.test');
	await page.goto('/courses');

	await page.getByRole('link', { name: 'Join Data Privacy Basics' }).click();
	await page.getByRole('button', { name: 'Join course' }).click();
	await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();

	await page.goto('/courses');
	await page.getByRole('link', { name: 'Join with code Workplace Safety' }).click();
	await page.getByLabel('Enrollment code').fill('wrong-code');
	await page.getByRole('button', { name: 'Join course' }).click();
	await expect(page.getByRole('alert')).toContainText('That code is not right');
	await page.getByLabel('Enrollment code').fill('SAFETY-2026');
	await page.getByRole('button', { name: 'Join course' }).click();
	await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();

	const myCourses = page.getByRole('region', { name: 'My courses' });
	await page.getByRole('link', { name: 'Dashboard' }).click();
	await expect(myCourses.getByRole('heading', { name: 'Data Privacy Basics' })).toBeVisible();
	await expect(myCourses.getByRole('heading', { name: 'Workplace Safety' })).toBeVisible();
	await signOut(page);

	// Golf Fundamentals is assigned-only: student4 can't open or join it.
	await signIn(page, 'student4@simplms.test');
	await page.goto('/courses');
	await expect(page.getByText('Not enrolled. Ask a teacher to add you.')).toBeVisible();
	const denied = await page.goto('/courses/golf-fundamentals');
	expect(denied?.status()).toBe(403);
	await signOut(page);

	// The teacher opens Golf Fundamentals with a code; student4 can then join with it.
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals/enrollments');
	await page.getByRole('radio', { name: /Enrollment code/ }).check();
	await page.getByRole('textbox', { name: 'Enrollment code' }).fill('FORE');
	await page.getByRole('button', { name: 'Save method' }).click();
	await expect(page.getByText('Enrollment method saved.')).toBeVisible();
	await signOut(page);

	await signIn(page, 'student4@simplms.test');
	await page.goto('/courses/golf-fundamentals');
	await page.getByLabel('Enrollment code').fill('FORE');
	await page.getByRole('button', { name: 'Join course' }).click();
	await expect(page.getByRole('heading', { name: 'Golf Explained (SCORM 1.2)' })).toBeVisible();
});

test('activities stay locked until prerequisites are complete; teachers set completion rules', async ({
	page
}) => {
	// Seeded: Golf Explained (SCORM 2004) requires Golf Explained (SCORM 1.2).
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals');
	await page.getByRole('link', { name: 'Preview Golf Explained (SCORM 2004)' }).click();
	await expect(page).toHaveURL(/\/activities\//);
	await expect(page.getByRole('heading', { name: 'Golf Explained (SCORM 2004)' })).toBeVisible();
	const lockedUrl = new URL(page.url()).pathname;

	// Activities used to live under /scorm/; old links redirect.
	await page.goto(lockedUrl.replace('/activities/', '/scorm/'));
	await expect(page).toHaveURL(lockedUrl);
	const contentUrl = await page.locator('iframe.sco').getAttribute('src');

	// Require a score of 90+ on the 1.2 activity.
	await page.goto('/courses/golf-fundamentals/manage');
	const first = page.getByRole('listitem').filter({
		has: page.getByRole('link', { name: 'Golf Explained (SCORM 1.2)', exact: true })
	});
	await first.locator('summary', { hasText: 'Settings' }).click();
	await first.getByLabel('Complete when the learner').selectOption('passed');
	await first.getByLabel('Passing score').fill('90');
	await first.getByRole('button', { name: 'Save settings' }).click();
	await expect(first.getByText('Settings saved.')).toBeVisible();
	await expect(first.getByText('Score at least 90')).toBeVisible();

	// Making 1.2 require 2004 would lock both forever.
	await first.getByRole('checkbox', { name: 'Golf Explained (SCORM 2004)' }).check();
	await first.getByRole('button', { name: 'Save settings' }).click();
	await expect(first.getByRole('alert')).toContainText('would create a loop');
	await signOut(page);

	// student2 hasn't started: 2004 is locked on the page, at its URL, and for its files.
	await signIn(page, 'student2@simplms.test');
	await page.goto('/courses/golf-fundamentals');
	const activity = (title: string) =>
		page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
	const locked = activity('Golf Explained (SCORM 2004)');
	await expect(locked.getByText('Locked', { exact: true })).toBeVisible();
	await expect(locked.getByText('Complete Golf Explained (SCORM 1.2) first.')).toBeVisible();
	await expect(locked.getByRole('link')).toHaveCount(0);
	await expect(
		activity('Golf Explained (SCORM 1.2)').getByText('To complete: score at least 90')
	).toBeVisible();

	expect((await page.goto(lockedUrl))?.status()).toBe(403);
	expect((await page.request.get(contentUrl!)).status()).toBe(403);
});

test('finished attempts open for review; retakes are limited by the attempt setting', async ({
	page
}) => {
	// student1 finished the SCORM 1.2 activity in the first test. Allow two attempts.
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals/manage');
	const settings = page.getByRole('listitem').filter({
		has: page.getByRole('link', { name: 'Golf Explained (SCORM 1.2)', exact: true })
	});
	await settings.locator('summary', { hasText: 'Settings' }).click();
	await settings.getByLabel('Attempts allowed').fill('2');
	await settings.getByRole('button', { name: 'Save settings' }).click();
	await expect(settings.getByText('Settings saved.')).toBeVisible();
	await signOut(page);

	await signIn(page, 'student1@simplms.test');
	await page.goto('/courses/golf-fundamentals');
	const activity = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name: 'Golf Explained (SCORM 1.2)' }) });
	await expect(activity.getByText('Attempt 1 of 2')).toBeVisible();

	// Reopening the finished attempt is review only.
	await activity.getByRole('link', { name: /^Review/ }).click();
	await expect(page.getByText('Review only')).toBeVisible();
	await expect(page.getByText('Attempt 1 of 2')).toBeVisible();

	// Start the second (last) attempt from the player and finish it.
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Start new attempt' }).click();
	await expect(page.getByText('Attempt 2 of 2')).toBeVisible();
	await expect(page.getByText('Review only')).toHaveCount(0);
	const next = page.frameLocator('iframe.sco').getByRole('button', { name: 'Next ->' });
	while (await next.isEnabled()) await next.click();
	await page.getByRole('button', { name: 'Exit', exact: true }).click();
	await expect(page).toHaveURL(/\/courses\/golf-fundamentals$/);

	// Both attempts used: review is still available, a third attempt is not.
	await expect(activity.getByText('Attempt 2 of 2')).toBeVisible();
	await expect(activity.getByRole('link', { name: /^Review/ })).toBeVisible();
	await expect(activity.getByRole('button', { name: /Start new attempt/ })).toHaveCount(0);

	// The server refuses a third attempt even if the form is posted directly.
	const activityId = new URL(
		(await activity.getByRole('link', { name: /^Review/ }).getAttribute('href'))!,
		page.url()
	).pathname
		.split('/')
		.at(-1)!;
	const response = await page.request.post('/courses/golf-fundamentals?/retake', {
		form: { activityId },
		headers: { origin: new URL(page.url()).origin, 'x-sveltekit-action': 'true' }
	});
	expect(await response.text()).toContain('used all your attempts');
});

test('teachers grant extra attempts; learners are notified; admins run jobs', async ({ page }) => {
	// student1 (Sam Student) used both attempts at SCORM 1.2 in the previous test without meeting
	// its 90+ passing score.
	await signIn(page, 'teacher2@simplms.test');
	await page.goto('/courses/golf-fundamentals/report');
	const row = page.getByRole('row').filter({ hasText: 'Sam Student' });
	await row.getByRole('button', { name: /Grant attempt.*SCORM 1\.2/ }).click();
	await expect(row.getByText('Granted')).toBeVisible();
	await signOut(page);

	await signIn(page, 'student1@simplms.test');
	await expect(page.getByRole('link', { name: /Notifications 1 unread/ })).toBeVisible();
	await page.getByRole('link', { name: /Notifications/ }).click();
	await page
		.getByRole('button', { name: /You have another attempt at Golf Explained \(SCORM 1\.2\)/ })
		.click();
	await expect(page).toHaveURL(/\/courses\/golf-fundamentals$/);
	const activity = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name: 'Golf Explained (SCORM 1.2)' }) });
	await expect(activity.getByText('Attempt 2 of 3')).toBeVisible();
	await expect(activity.getByRole('button', { name: /Start new attempt/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /unread/ })).toHaveCount(0);
	await signOut(page);

	// student5 was enrolled by a teacher in an earlier test.
	await signIn(page, 'student5@simplms.test');
	await page.goto('/notifications');
	await expect(page.getByText('You were added to Golf Fundamentals')).toBeVisible();
	await signOut(page);

	await signIn(page, 'admin@simplms.test');
	await page.goto('/admin/jobs');
	const job = page.getByRole('row').filter({ hasText: 'course-reminders' });
	await job.getByRole('button', { name: /Run now/ }).click();
	await expect(job.getByText(/^Done: /)).toBeVisible();
	await expect(job.getByText('OK', { exact: true })).toBeVisible();
	await signOut(page);

	// Jobs are admin-only; managers can't reach them.
	await signIn(page, 'manager@simplms.test');
	expect((await page.goto('/admin/jobs'))?.status()).toBe(403);
});

test('people choose which notifications are emailed; the delivery job sends the rest', async ({
	page
}) => {
	await signIn(page, 'student1@simplms.test');
	await page.goto('/notifications');
	await page.getByRole('link', { name: 'Email settings' }).click();
	const reminders = page.getByRole('checkbox', { name: /Course reminders/ });
	await expect(reminders).toBeChecked();
	await reminders.uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.reload();
	await expect(page.getByRole('checkbox', { name: /Course reminders/ })).not.toBeChecked();
	await expect(page.getByRole('checkbox', { name: /Extra attempt/ })).toBeChecked();
	await signOut(page);

	// Earlier tests created notifications; the log transport "sends" them.
	await signIn(page, 'admin@simplms.test');
	await page.goto('/admin/jobs');
	const job = page.getByRole('row').filter({ hasText: 'deliver-email' });
	await job.getByRole('button', { name: /Run now/ }).click();
	await expect(job.getByText(/^Done: \d+ sent, \d+ skipped, 0 failed \(via log\)$/)).toBeVisible();
});

test('enrollment code guesses are rate limited', async ({ page }) => {
	// student2 isn't in Workplace Safety, which needs the code SAFETY-2026.
	await signIn(page, 'student2@simplms.test');
	await page.goto('/courses/workplace-safety');
	const code = page.getByLabel('Enrollment code');
	const join = page.getByRole('button', { name: 'Join course' });
	for (let i = 0; i < 5; i++) {
		await code.fill(`wrong-${i}`);
		await join.click();
		await expect(page.getByRole('alert')).toContainText('That code is not right');
	}

	// The sixth try is refused before the code is even checked, so the right code fails too.
	await code.fill('SAFETY-2026');
	await join.click();
	await expect(page.getByRole('alert')).toContainText('Too many tries. Try again in 15 minutes');
	await expect(page.getByRole('heading', { name: 'Join this course' })).toBeVisible();
});

test('parallel enrollment code guesses cannot get past the limit', async ({ page }) => {
	await signIn(page, 'student5@simplms.test');
	const origin = new URL(page.url()).origin;
	const guesses = await Promise.all(
		Array.from({ length: 20 }, (_, i) =>
			page.request
				.post('/courses/workplace-safety?/join', {
					form: { key: `burst-${i}` },
					headers: { origin, 'x-sveltekit-action': 'true' }
				})
				.then((r) => r.text())
		)
	);
	// Exactly five guesses were checked; the other fifteen were refused before checking.
	expect(guesses.filter((t) => t.includes('That code is not right'))).toHaveLength(5);
	expect(guesses.filter((t) => t.includes('Too many tries'))).toHaveLength(15);
});
