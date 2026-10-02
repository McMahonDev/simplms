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
