/**
 * HTTP transport for scorm-again commits, passed as its `httpService` setting.
 *
 * scorm-again's default synchronous service sends the terminate commit with
 * navigator.sendBeacon, which is fire-and-forget: when the learner clicks Exit, the course
 * page can load before the final status reaches the server. This transport uses a
 * synchronous XHR for every commit while the page stays open, so LMSFinish/Terminate
 * returns only after the server has stored the data (SCORM 2004 RTE 3.1.4.2 expects
 * Terminate to persist data before returning). It falls back to sendBeacon only while the
 * page itself is being closed, where browsers forbid synchronous XHR.
 */

type CommitResult = { result: string | boolean; errorCode: number };

const GENERAL_FAILURE = 101;

let pageClosing = false;
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', () => (pageClosing = true));
	window.addEventListener('pageshow', () => (pageClosing = false));
}

function parseResponse(xhr: XMLHttpRequest): CommitResult {
	if (xhr.status < 200 || xhr.status > 299) return { result: 'false', errorCode: GENERAL_FAILURE };
	try {
		const body = JSON.parse(xhr.responseText) as Partial<CommitResult>;
		const ok = body.result === true || body.result === 'true';
		return {
			result: ok ? 'true' : 'false',
			errorCode: ok ? 0 : (body.errorCode ?? GENERAL_FAILURE)
		};
	} catch {
		return { result: 'false', errorCode: GENERAL_FAILURE };
	}
}

export function createCommitTransport() {
	return {
		processHttpRequest(url: string, params: unknown, immediate: boolean): CommitResult {
			const body = JSON.stringify(params);

			if (immediate && pageClosing) {
				const sent = navigator.sendBeacon(
					url,
					new Blob([body], { type: 'text/plain;charset=UTF-8' })
				);
				return { result: sent ? 'true' : 'false', errorCode: sent ? 0 : GENERAL_FAILURE };
			}

			const xhr = new XMLHttpRequest();
			xhr.open('POST', url, false);
			xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
			try {
				xhr.send(body);
			} catch {
				return { result: 'false', errorCode: GENERAL_FAILURE };
			}
			return parseResponse(xhr);
		},
		updateSettings() {}
	};
}
