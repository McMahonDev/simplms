import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Activities used to live under /scorm/; keep old links and bookmarks working. */
export const load: PageServerLoad = ({ params }) => {
	redirect(308, `/courses/${params.slug}/activities/${params.packageId}`);
};
