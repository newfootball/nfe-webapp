import { type Page, type Request, test } from "@playwright/test";
import { fromCrossJSON } from "seroval";

// Diagnostic scalars only: never retain URLs, keys, cookies or capability bodies.
export function mediaNetworkWitness(page: Page) {
	const events: Record<string, unknown>[] = [];
	const pending: Promise<void>[] = [];
	const started = Date.now();
	const recordRequest = (
		kind: "request" | "requestfailed",
		request: Request,
	) => {
		const url = new URL(request.url());
		if (!url.hostname.endsWith(".backblazeb2.com") || events.length >= 100)
			return;
		const date = url.searchParams.get("X-Amz-Date") ?? "";
		const iso = date.replace(
			/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
			"$1-$2-$3T$4:$5:$6Z",
		);
		const failure = request.failure()?.errorText ?? "";
		events.push({
			elapsedMs: Date.now() - started,
			kind,
			method: request.method(),
			range: request.headers().range,
			signatureAgeMs: Date.now() - Date.parse(iso),
			ttlSeconds: Number(url.searchParams.get("X-Amz-Expires")),
			...(kind === "requestfailed"
				? {
						failure: /^net::[A-Z0-9_]+$/.test(failure) ? failure : "suppressed",
					}
				: {}),
		});
	};
	page.on("request", (request) => recordRequest("request", request));
	page.on("requestfailed", (request) =>
		recordRequest("requestfailed", request),
	);

	page.on("response", (response) => {
		const url = new URL(response.url());
		const isStorage = url.hostname.endsWith(".backblazeb2.com");
		if (!isStorage && !url.pathname.startsWith("/_serverFn/")) return;
		if (events.length >= 100) return;
		const event: Record<string, unknown> = {
			elapsedMs: Date.now() - started,
			kind: isStorage ? "storage" : "rpc",
			method: response.request().method(),
			status: response.status(),
			serviceWorker: response.fromServiceWorker(),
		};
		events.push(event);
		if (isStorage) {
			const date = url.searchParams.get("X-Amz-Date") ?? "";
			const iso = date.replace(
				/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
				"$1-$2-$3T$4:$5:$6Z",
			);
			event.signatureAgeMs = Date.now() - Date.parse(iso);
			event.ttlSeconds = Number(url.searchParams.get("X-Amz-Expires"));
			event.range = response.request().headers().range;
		} else {
			pending.push(
				(async () => {
					try {
						const envelope = fromCrossJSON(await response.json(), {}) as {
							result?: { ok?: boolean; error?: string };
						};
						event.ok = envelope.result?.ok;
						const error = envelope.result?.error;
						if (
							error &&
							[
								"unauthorized",
								"unavailable",
								"forbidden",
								"invalid",
								"conflict",
								"origin",
							].includes(error)
						)
							event.error = error;
					} catch {
						/* Framed or non-JSON replies disclose no body. */
					}
				})(),
			);
		}
	});
	return async () => {
		await Promise.allSettled(pending);
		test.info().annotations.push({
			type: "network-witness",
			description: JSON.stringify(events),
		});
	};
}
