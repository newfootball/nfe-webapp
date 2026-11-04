// Liveness answers while the process serves; readiness additionally proves the
// Appwrite endpoint answers its public, keyless version route. Neither endpoint
// exposes configuration, credentials or the failure cause.
const headers = { "Cache-Control": "no-store" };

export function livenessResponse(draining: boolean) {
	return Response.json(
		{ status: draining ? "draining" : "ok" },
		{ status: draining ? 503 : 200, headers },
	);
}

export function readinessResponse(draining: boolean, appwrite: boolean) {
	const ok = !draining && appwrite;
	return Response.json(
		{
			status: ok ? "ok" : "unavailable",
			checks: { appwrite: appwrite ? "ok" : "unavailable" },
		},
		{ status: ok ? 200 : 503, headers },
	);
}

export function createAppwriteProbe(
	endpoint: string,
	options: {
		timeoutMs?: number;
		cacheMs?: number;
		fetch?: typeof fetch;
		now?: () => number;
	} = {},
) {
	const timeoutMs = options.timeoutMs ?? 3000,
		cacheMs = options.cacheMs ?? 5000,
		doFetch = options.fetch ?? fetch,
		now = options.now ?? Date.now;
	let cached: { at: number; ok: boolean } | undefined;
	let inflight: Promise<boolean> | undefined;
	async function probe() {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await doFetch(`${endpoint}/health/version`, {
				signal: controller.signal,
				headers: { Accept: "application/json" },
			});
			return response.ok;
		} catch {
			return false;
		} finally {
			clearTimeout(timer);
		}
	}
	return async function ready() {
		if (cached && now() - cached.at < cacheMs) return cached.ok;
		inflight ??= probe().then((ok) => {
			cached = { at: now(), ok };
			inflight = undefined;
			return ok;
		});
		return inflight;
	};
}
