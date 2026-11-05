// Redacted access logs, rolling request metrics and threshold alerts for the
// production entry. Lines are JSON on stdout so Coolify keeps them; nothing here
// ever records a query string, header, body, cookie or signed URL.
import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";

const maxPathLength = 160;
const secretPatterns: [RegExp, string][] = [
	[
		/(X-Amz-(?:Signature|Credential|Security-Token)=)[^&\s"']+/gi,
		"$1[redacted]",
	],
	[/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, "$1 [redacted]"],
	[
		/\b((?:api[_-]?key|secret|password|token|session|key)["']?\s*[=:]\s*["']?)[^&\s"',;]+/gi,
		"$1[redacted]",
	],
	[/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]"],
];

export function redactText(value: string, limit = 300) {
	let text = value;
	for (const [pattern, replacement] of secretPatterns)
		text = text.replace(pattern, replacement);
	return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// Path only: query strings may carry return URLs, tokens or OAuth codes.
export function logPath(pathname: string) {
	const path = pathname.replace(/[^\x21-\x7e]/g, "?");
	return path.length > maxPathLength
		? `${path.slice(0, maxPathLength)}…`
		: path;
}

export type Thresholds = {
	errorRate: number;
	p95Ms: number;
	inflight: number;
	rssBytes: number;
	tmpFreeBytes: number;
};

// Starting values for a single small container; revise from real traffic.
export const defaultThresholds: Thresholds = {
	errorRate: 0.02,
	p95Ms: 1500,
	inflight: 64,
	rssBytes: 768 * 1024 * 1024,
	tmpFreeBytes: 1024 * 1024 * 1024,
};

export type WindowSnapshot = {
	windowMs: number;
	requests: number;
	status: { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
	errorRate: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	maxMs: number;
	inflight: number;
	maxInflight: number;
};

export type Resources = {
	rssBytes: number;
	heapUsedBytes: number;
	tmpFreeBytes?: number;
};

function percentile(sorted: number[], ratio: number) {
	if (!sorted.length) return 0;
	return (
		sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)] ??
		0
	);
}

export function createRequestMetrics(now: () => number = Date.now) {
	let windowStart = now();
	let durations: number[] = [];
	let status = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
	let inflight = 0;
	let maxInflight = 0;
	return {
		begin() {
			inflight += 1;
			if (inflight > maxInflight) maxInflight = inflight;
		},
		end(code: number, durationMs: number) {
			inflight = Math.max(0, inflight - 1);
			const bucket =
				code >= 500 ? "5xx" : code >= 400 ? "4xx" : code >= 300 ? "3xx" : "2xx";
			status[bucket] += 1;
			if (durations.length < 50_000) durations.push(durationMs);
		},
		// Returns the closed window and starts a new one.
		flush(): WindowSnapshot {
			const sorted = durations.sort((a, b) => a - b);
			const requests =
				status["2xx"] + status["3xx"] + status["4xx"] + status["5xx"];
			const snapshot: WindowSnapshot = {
				windowMs: now() - windowStart,
				requests,
				status,
				errorRate: requests ? status["5xx"] / requests : 0,
				p50Ms: Math.round(percentile(sorted, 0.5)),
				p95Ms: Math.round(percentile(sorted, 0.95)),
				p99Ms: Math.round(percentile(sorted, 0.99)),
				maxMs: Math.round(sorted.at(-1) ?? 0),
				inflight,
				maxInflight,
			};
			windowStart = now();
			durations = [];
			status = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
			maxInflight = inflight;
			return snapshot;
		},
	};
}

// Error rate needs a minimum sample so one failed request at night does not page.
export function breachedThresholds(
	window: WindowSnapshot,
	resources: Resources,
	thresholds: Thresholds = defaultThresholds,
) {
	const breached: string[] = [];
	if (window.requests >= 20 && window.errorRate > thresholds.errorRate)
		breached.push("error_rate");
	if (window.requests >= 20 && window.p95Ms > thresholds.p95Ms)
		breached.push("latency_p95");
	if (window.maxInflight > thresholds.inflight)
		breached.push("saturation_inflight");
	if (resources.rssBytes > thresholds.rssBytes) breached.push("memory_rss");
	if (
		resources.tmpFreeBytes !== undefined &&
		resources.tmpFreeBytes < thresholds.tmpFreeBytes
	)
		breached.push("storage_tmp_free");
	return breached;
}

export async function readResources(): Promise<Resources> {
	const memory = process.memoryUsage();
	const resources: Resources = {
		rssBytes: memory.rss,
		heapUsedBytes: memory.heapUsed,
	};
	try {
		const disk = await statfs(tmpdir());
		resources.tmpFreeBytes = disk.bavail * disk.bsize;
	} catch {}
	return resources;
}

export function jsonLine(event: string, fields: Record<string, unknown>) {
	return `${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`;
}

export const maxClientErrorBytes = 4096;

// Traefik appends the peer address last; earlier values are client-supplied.
export function clientErrorSource(headers: Headers, trustProxy: boolean) {
	if (!trustProxy) return "direct";
	return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

export function createKeyedRateLimit(
	limit: number,
	windowMs: number,
	now: () => number = Date.now,
	maxKeys = 10_000,
) {
	let start = now();
	let counts = new Map<string, number>();
	return (key: string) => {
		if (now() - start >= windowMs || counts.size >= maxKeys) {
			start = now();
			counts = new Map();
		}
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		return count <= limit;
	};
}

export type ClientErrorReport = { kind: string; message: string; path: string };

// Same-origin browser beacons only; size-capped and redacted before logging.
export function parseClientError(
	body: string,
	origin: string | null,
	fetchSite: string | null,
	canonicalOrigin: string,
): ClientErrorReport | undefined {
	if (origin ? origin !== canonicalOrigin : fetchSite !== "same-origin") return;
	if (body.length > maxClientErrorBytes) return;
	let input: unknown;
	try {
		input = JSON.parse(body);
	} catch {
		return;
	}
	if (!input || typeof input !== "object") return;
	const { kind, message, path } = input as Record<string, unknown>;
	if (kind !== "error" && kind !== "unhandledrejection") return;
	if (typeof message !== "string" || typeof path !== "string") return;
	return {
		kind,
		message: redactText(message),
		path: logPath(path.split(/[?#]/)[0] ?? ""),
	};
}

export function createRateLimit(
	limit: number,
	windowMs: number,
	now: () => number = Date.now,
) {
	let start = now();
	let count = 0;
	return () => {
		if (now() - start >= windowMs) {
			start = now();
			count = 0;
		}
		count += 1;
		return count <= limit;
	};
}
