<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createCommitTransport } from '#lib/scorm/commit-transport.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The subset of the scorm-again API surface the player drives. */
	type PlayerApi = {
		isInitialized(): boolean;
		isTerminated(): boolean;
		commit(): void;
		finish(): void;
	};

	let iframeSrc = $state<string | null>(null);
	let status = $state<'loading' | 'ready' | 'error' | 'exiting'>('loading');
	let player: PlayerApi | null = null;

	async function createApi(): Promise<PlayerApi> {
		const settings = {
			// Commit to our tracking endpoint whenever the SCO sets values (after a short delay)
			// and on LMSCommit/Commit and LMSFinish/Terminate.
			autocommit: true,
			autocommitSeconds: 10,
			lmsCommitUrl: data.commitUrl,
			dataCommitFormat: 'json' as const,
			sendFullCommit: true,
			logLevel: 4 as const,
			httpService: createCommitTransport()
		};

		// The API must be on window before the SCO loads: SCOs find it by walking
		// window.parent (SCORM 1.2 RTE 3.3.6.1, SCORM 2004 RTE 3.1.2.1).
		if (data.activity.version === '1.2') {
			const { Scorm12API } = await import('scorm-again/scorm12');
			const api = new Scorm12API(settings);
			api.loadFromJSON(data.cmi);
			window.API = api;
			return {
				isInitialized: () => api.isInitialized(),
				isTerminated: () => api.isTerminated(),
				commit: () => api.LMSCommit(''),
				finish: () => api.LMSFinish('')
			};
		}
		const { Scorm2004API } = await import('scorm-again/scorm2004');
		const api = new Scorm2004API(settings);
		api.loadFromJSON(data.cmi);
		window.API_1484_11 = api;
		return {
			isInitialized: () => api.isInitialized(),
			isTerminated: () => api.isTerminated(),
			commit: () => api.Commit(''),
			finish: () => api.Terminate('')
		};
	}

	let frame = $state<HTMLIFrameElement>();

	/**
	 * Navigates the SCO's frame away so it gets a normal beforeunload/unload sequence.
	 * Many SCOs (the Golf Examples included) save `exit = "suspend"` and call
	 * LMSFinish/Terminate from those handlers; just removing the iframe skips beforeunload.
	 */
	function unloadSco(): Promise<void> {
		const win = frame?.contentWindow;
		if (!frame || !win) return Promise.resolve();
		return new Promise((resolve) => {
			const timer = setTimeout(resolve, 3000);
			frame!.addEventListener(
				'load',
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true }
			);
			win.location.replace('about:blank');
		});
	}

	/** Makes sure the session is saved even if the SCO never called LMSFinish/Terminate. */
	function finishIfNeeded() {
		if (player?.isInitialized() && !player.isTerminated()) {
			player.commit();
			player.finish();
		}
	}

	async function exit() {
		status = 'exiting';
		await unloadSco();
		iframeSrc = null;
		finishIfNeeded();
		await goto(`/courses/${data.course.slug}`, { refreshAll: true });
	}

	onMount(() => {
		let disposed = false;
		createApi()
			.then((api) => {
				if (disposed) return;
				player = api;
				iframeSrc = data.launchUrl;
				status = 'ready';
			})
			.catch(() => {
				status = 'error';
			});

		return () => {
			// Navigating away inside the app: the frame is about to be removed, so this is
			// the last chance to save. (Closing the tab unloads the SCO normally.)
			disposed = true;
			finishIfNeeded();
			delete window.API;
			delete window.API_1484_11;
		};
	});
</script>

<svelte:head><title>{data.activity.title} · SimpLMS</title></svelte:head>

<div class="player">
	<div class="toolbar">
		<div class="title">
			<a href="/courses/{data.course.slug}" class="muted course">{data.course.title}</a>
			<h1>{data.activity.title}</h1>
		</div>
		<div class="cluster actions">
			<span class="muted attempt">
				Attempt {data.attempt.number}{#if data.attempt.max}&nbsp;of {data.attempt.max}{/if}
			</span>
			{#if data.attempt.review}
				<span class="badge warning" title="This attempt is finished. Nothing you do here is saved."
					>Review only</span
				>
				{#if data.attempt.canRetake}
					<form method="POST" action="/courses/{data.course.slug}?/retake">
						<input type="hidden" name="activityId" value={data.activity.id} />
						<button type="submit">Start new attempt</button>
					</form>
				{/if}
			{/if}
			<button type="button" class="secondary" onclick={exit} disabled={status === 'exiting'}>
				{status === 'exiting' ? 'Saving…' : 'Exit'}
			</button>
		</div>
	</div>

	<div class="stage">
		{#if status === 'error'}
			<p class="alert error" role="alert">
				The SCORM player failed to load. Try reloading the page.
			</p>
		{:else if iframeSrc}
			<iframe
				bind:this={frame}
				class="sco"
				src={iframeSrc}
				title={data.activity.title}
				allow="fullscreen"
			></iframe>
		{:else}
			<p class="muted loading" role="status">Loading activity…</p>
		{/if}
		<noscript>
			<p class="alert error">SCORM activities need JavaScript to track your progress.</p>
		</noscript>
	</div>
</div>

<style>
	/* Break out of the centered content column to use the full viewport width. */
	.player {
		width: 100vw;
		margin-inline: calc(50% - 50vw);
		margin-block: calc(-1 * var(--space-l)) calc(-1 * var(--space-2xl));
		display: grid;
		grid-template-rows: auto 1fr;
		height: calc(100dvh - var(--header-height));
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-m);
		padding: var(--space-xs) var(--space-m);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.title {
		min-width: 0;

		& h1 {
			font-size: var(--text-m);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	.actions {
		flex-wrap: nowrap;
		justify-content: end;
	}

	.attempt {
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.course {
		font-size: var(--text-xs);
		text-decoration: none;
	}

	.stage {
		position: relative;
		background: #fff;
		min-height: 0;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: 0;
	}

	.loading,
	.stage > .alert {
		margin: var(--space-l);
	}
</style>
