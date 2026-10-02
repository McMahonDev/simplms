import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScormImportError } from './errors.js';
import { detectVersion, normalizeLaunchHref, parseManifest } from './manifest.js';

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Builds a small manifest; pieces default to a valid SCORM 2004 single-SCO package. */
function manifest({
	ns = 'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"',
	metadata = '<metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>',
	manifestAttrs = '',
	organizations = `<organizations default="org1">
		<organization identifier="org1"><title>Org One</title>
			<item identifier="i1" identifierref="r1"><title>Item</title></item>
		</organization>
	</organizations>`,
	resourcesAttrs = '',
	resources = '<resource identifier="r1" type="webcontent" adlcp:scormType="sco" href="index.html"/>'
} = {}) {
	return `<?xml version="1.0"?>
<manifest identifier="m1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" ${ns} ${manifestAttrs}>
	${metadata}
	${organizations}
	<resources ${resourcesAttrs}>${resources}</resources>
</manifest>`;
}

describe('parseManifest: Golf Examples fixtures', () => {
	it('parses the SCORM 1.2 Run-time Basic Calls package', () => {
		const m = parseManifest(fixture('golf-12.xml'));
		expect(m.version).toBe('1.2');
		expect(m.schemaVersion).toBe('1.2');
		expect(m.identifier).toBe('com.scorm.golfsamples.runtime.basicruntime.12');
		expect(m.title).toBe('Golf Explained - Run-time Basic Calls');
		expect(m.entryHref).toBe('shared/launchpage.html');
		expect(m.json).toHaveProperty('manifest');
	});

	it('parses the SCORM 2004 3rd Edition Run-time Basic Calls package', () => {
		const m = parseManifest(fixture('golf-2004.xml'));
		expect(m.version).toBe('2004');
		expect(m.schemaVersion).toBe('2004 3rd Edition');
		expect(m.title).toBe('Golf Explained - Run-time Basic Calls');
		expect(m.entryHref).toBe('shared/launchpage.html');
	});
});

describe('parseManifest: version detection', () => {
	it('falls back to the adlcp namespace when schemaversion is missing', () => {
		expect(parseManifest(manifest({ metadata: '' })).version).toBe('2004');
		expect(
			parseManifest(
				manifest({
					metadata: '',
					ns: 'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"',
					resources:
						'<resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"/>'
				})
			).version
		).toBe('1.2');
	});

	it('accepts "CAM 1.3" as SCORM 2004', () => {
		expect(detectVersion('CAM 1.3', '')).toBe('2004');
	});

	it('rejects packages that are neither 1.2 nor 2004', () => {
		expect(() => parseManifest(manifest({ metadata: '', ns: '' }))).toThrow(/SCORM version/);
	});
});

describe('parseManifest: launch resolution', () => {
	it('uses the default organization, not the first one', () => {
		const m = parseManifest(
			manifest({
				organizations: `<organizations default="b">
					<organization identifier="a"><title>A</title><item identifier="ia" identifierref="ra"/></organization>
					<organization identifier="b"><title>B</title><item identifier="ib" identifierref="rb"/></organization>
				</organizations>`,
				resources: `<resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/>`
			})
		);
		expect(m.title).toBe('B');
		expect(m.entryHref).toBe('b.html');
	});

	it('finds the first item with an identifierref in nested items', () => {
		const m = parseManifest(
			manifest({
				organizations: `<organizations default="o">
					<organization identifier="o"><title>Nested</title>
						<item identifier="chapter"><title>Chapter</title>
							<item identifier="sco1" identifierref="r2"><title>Lesson</title></item>
						</item>
					</organization>
				</organizations>`,
				resources: `<resource identifier="r1" href="wrong.html"/><resource identifier="r2" href="lesson/start.html"/>`
			})
		);
		expect(m.entryHref).toBe('lesson/start.html');
	});

	it('applies xml:base from manifest, resources, and resource', () => {
		const m = parseManifest(
			manifest({
				manifestAttrs: 'xml:base="content/"',
				resourcesAttrs: 'xml:base="v2"',
				resources: '<resource identifier="r1" xml:base="sco1/" href="index.html"/>'
			})
		);
		expect(m.entryHref).toBe('content/v2/sco1/index.html');
	});

	it('appends item parameters to the launch href', () => {
		const m = parseManifest(
			manifest({
				organizations: `<organizations default="o"><organization identifier="o"><title>T</title>
					<item identifier="i" identifierref="r1" parameters="?mode=review"/>
				</organization></organizations>`,
				resources: '<resource identifier="r1" href="index.html?lang=en"/>'
			})
		);
		expect(m.entryHref).toBe('index.html?lang=en&mode=review');
	});

	it('fails clearly when no item references a resource', () => {
		expect(() =>
			parseManifest(
				manifest({
					organizations:
						'<organizations default="o"><organization identifier="o"><title>T</title></organization></organizations>'
				})
			)
		).toThrow(ScormImportError);
	});

	it('fails clearly when the referenced resource is missing', () => {
		expect(() => parseManifest(manifest({ resources: '' }))).toThrow(/missing or has no href/);
	});

	it('refuses launch files outside the package', () => {
		expect(() =>
			parseManifest(manifest({ resources: '<resource identifier="r1" href="../../etc/passwd"/>' }))
		).toThrow(/outside the package/);
		expect(() =>
			parseManifest(
				manifest({ resources: '<resource identifier="r1" href="https://example.com/sco.html"/>' })
			)
		).toThrow(/External launch URLs/);
	});

	it('rejects malformed XML and missing roots', () => {
		expect(() => parseManifest('<not-a-manifest/>')).toThrow(/<manifest>/);
	});
});

describe('normalizeLaunchHref', () => {
	it('normalizes dot segments and backslashes but keeps the query', () => {
		expect(normalizeLaunchHref('./a/../b\\index.html?x=1#top')).toBe('b/index.html?x=1#top');
	});
});
