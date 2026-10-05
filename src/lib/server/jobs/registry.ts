/**
 * Every scheduled job. Add a job by writing a `Job` and listing it here; the runner creates
 * its row in the job table on the next tick.
 */
import { courseReminders } from './course-reminders.js';
import { deliverEmail } from './deliver-email.js';
import { pruneNotifications } from './prune-notifications.js';
import type { Job } from './types.js';

export const jobs: Job[] = [deliverEmail, courseReminders, pruneNotifications];
