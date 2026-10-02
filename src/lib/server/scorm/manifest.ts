/**
 * imsmanifest.xml parsing: version detection and launch-file resolution.
 *
 * References:
 * - SCORM 1.2 CAM, section 2.3 (Content Packaging / manifest structure):
 *   https://adlnet.gov/projects/scorm-1-2/  (SCORM_1.2_CAM.pdf)
 * - SCORM 2004 4th Ed. CAM, section 3.4 (Manifest elements) and 3.4.1.17 (xml:base):
 *   https://adlnet.gov/projects/scorm-2004-4th-edition/  (SCORM_2004_4ED_v1_1_CAM.pdf)
 * - Rustici's summary of package structure: https://scorm.com/scorm-explained/technical-scorm/content-packaging/
 */
import path from 'node:path/posix';
import { XMLParser } from 'fast-xml-parser';
import type { ScormVersion } from '../db/schema.js';
import { ScormImportError } from './errors.js';

export type ParsedManifest = {
	identifier: string | null;
	version: ScormVersion;
	/** Raw <schemaversion> text, e.g. "1.2" or "2004 3rd Edition". */
	schemaVersion: string | null;
	title: string;
	/** Launch URL of the first SCO, relative to the package root (may include a query string). */
	entryHref: string;
	/** The whole manifest as JSON, stored for later use (multi-SCO, sequencing). */
	json: unknown;
};

// Elements that may repeat; always parse them as arrays so traversal is uniform.
const ARRAY_TAGS = new Set(['organization', 'item', 'resource', 'file', 'dependency']);

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	// Prefixes vary between packages (adlcp:scormtype vs adlcp:scormType, xml:base);
	// drop them and match on local names instead.
	removeNSPrefix: true,
	parseTagValue: false,
	parseAttributeValue: false,
	trimValues: true,
	isArray: (name) => ARRAY_TAGS.has(name)
});

type XmlNode = Record<string, unknown>;

const asNode = (v: unknown): XmlNode | undefined =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : undefined;
const asNodes = (v: unknown): XmlNode[] =>
	Array.isArray(v)
		? v.filter((x): x is XmlNode => Boolean(asNode(x)))
		: asNode(v)
			? [v as XmlNode]
			: [];
const attr = (node: XmlNode | undefined, name: string): string | undefined => {
	const v = node?.[`@_${name}`];
	return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

/** Element text, whether the parser produced a string or an object with #text. */
function text(v: unknown): string | undefined {
	if (typeof v === 'string') return v.trim() || undefined;
	if (typeof v === 'number') return String(v);
	const node = asNode(v);
	if (node && typeof node['#text'] === 'string') return node['#text'].trim() || undefined;
	// SCORM 2004 metadata titles can be <title><langstring>..</langstring></title>.
	if (node?.langstring !== undefined) return text(asNodes(node.langstring)[0] ?? node.langstring);
	return undefined;
}

/**
 * Detects the SCORM version.
 * 1. <metadata><schemaversion>: "1.2" means SCORM 1.2; "CAM 1.3" or "2004 ..." means 2004.
 * 2. Otherwise the ADL content packaging namespace declared on the manifest:
 *    adlcp_rootv1p2 (1.2) vs adlcp_v1p3 (2004).
 */
export function detectVersion(
	schemaVersion: string | undefined,
	rawXml: string
): ScormVersion | null {
	if (schemaVersion) {
		const v = schemaVersion.toLowerCase();
		if (v === '1.2') return '1.2';
		if (v.startsWith('2004') || v === 'cam 1.3') return '2004';
	}
	if (/adlcp_rootv1p2/i.test(rawXml)) return '1.2';
	if (/adlcp_v1p3/i.test(rawXml)) return '2004';
	return null;
}

/** Applies xml:base values from outermost to innermost, then the href itself. */
function joinBase(bases: (string | undefined)[], href: string): string {
	let url = '';
	for (const part of [...bases, href]) {
		if (!part) continue;
		// Absolute URLs (rare, but allowed for xml:base) reset the chain.
		if (/^[a-z][a-z0-9+.-]*:/i.test(part)) {
			url = part;
			continue;
		}
		url = url && !url.endsWith('/') ? `${url}/${part}` : `${url}${part}`;
	}
	return url;
}

/** Depth-first search for the first <item> that references a resource. */
function firstLaunchableItem(items: XmlNode[]): XmlNode | undefined {
	for (const item of items) {
		if (attr(item, 'identifierref')) return item;
		const nested = firstLaunchableItem(asNodes(item.item));
		if (nested) return nested;
	}
	return undefined;
}

/**
 * Appends item@parameters to the launch href.
 * SCORM 2004 CAM 3.4.1.10: leading "?" or "&" is dropped and joined appropriately; "#"
 * fragments are appended as-is.
 */
function withParameters(href: string, parameters: string | undefined): string {
	if (!parameters) return href;
	if (parameters.startsWith('#')) return href.includes('#') ? href : href + parameters;
	const params = parameters.replace(/^[?&]+/, '');
	if (!params) return href;
	return href + (href.includes('?') ? '&' : '?') + params;
}

/** Normalizes a package-relative launch path and refuses anything that escapes the root. */
export function normalizeLaunchHref(href: string): string {
	const [pathPart, ...rest] = href.split(/(?=[?#])/);
	const decoded = pathPart.replace(/\\/g, '/');
	const normalized = path.normalize(decoded).replace(/^\.\//, '');
	if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) {
		throw new ScormImportError(`The launch file "${href}" points outside the package.`);
	}
	return normalized + rest.join('');
}

export function parseManifest(xml: string): ParsedManifest {
	let doc: XmlNode;
	try {
		doc = parser.parse(xml) as XmlNode;
	} catch {
		throw new ScormImportError('imsmanifest.xml is not well-formed XML.');
	}

	const manifest = asNode(doc.manifest);
	if (!manifest) throw new ScormImportError('imsmanifest.xml has no <manifest> root element.');

	const metadata = asNode(manifest.metadata);
	const schemaVersion = text(metadata?.schemaversion);
	const version = detectVersion(schemaVersion, xml);
	if (!version) {
		throw new ScormImportError(
			'Could not detect the SCORM version. Only SCORM 1.2 and SCORM 2004 packages are supported.'
		);
	}

	const organizationsNode = asNode(manifest.organizations);
	const organizations = asNodes(organizationsNode?.organization);
	const defaultOrgId = attr(organizationsNode, 'default');
	const organization =
		organizations.find((o) => attr(o, 'identifier') === defaultOrgId) ?? organizations[0];

	const resourcesNode = asNode(manifest.resources);
	const resources = asNodes(resourcesNode?.resource);

	const item = organization ? firstLaunchableItem(asNodes(organization.item)) : undefined;
	if (!item) {
		throw new ScormImportError(
			'The manifest has no organization item that references a resource, so there is nothing to launch.'
		);
	}

	const resourceId = attr(item, 'identifierref');
	const resource = resources.find((r) => attr(r, 'identifier') === resourceId);
	const href = attr(resource, 'href');
	if (!resource || !href) {
		throw new ScormImportError(
			`The first item references resource "${resourceId}", which is missing or has no href.`
		);
	}

	const launch = joinBase(
		[attr(manifest, 'base'), attr(resourcesNode, 'base'), attr(resource, 'base')],
		href
	);
	if (/^[a-z][a-z0-9+.-]*:/i.test(launch)) {
		throw new ScormImportError(
			'External launch URLs are not supported; the SCO must be in the package.'
		);
	}

	const title =
		text(organization?.title) ??
		text(asNode(asNode(metadata?.lom)?.general)?.title) ??
		text(item.title) ??
		'Untitled package';

	return {
		identifier: attr(manifest, 'identifier') ?? null,
		version,
		schemaVersion: schemaVersion ?? null,
		title,
		entryHref: normalizeLaunchHref(withParameters(launch, attr(item, 'parameters'))),
		json: doc
	};
}
