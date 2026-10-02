/** Zod schemas for forms that are used by more than one route. */
import { z } from 'zod';
import { formFields } from './validation.js';

export const courseSchema = z.object({
	title: formFields.trimmed(200),
	slug: formFields.optionalSlug(),
	summary: formFields.optionalText(5000),
	categoryId: formFields.uuid(),
	visible: formFields.checkbox()
});
