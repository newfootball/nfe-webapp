import { expect, test } from "bun:test";
import {
	breachedThresholds,
	createRateLimit,
	createRequestMetrics,
	jsonLine,
	logPath,
	parseClientError,
	redactText,
} from "../server/telemetry";

const origin = "https://nfe-foot.example";

test("redaction removes signatures, bearer tokens, key values and long opaque strings", () => {
	const signed =
		"GET https://s3.example/b/k?X-Amz-Credential=AKIA123%2Fscope&X-Amz-Signature=deadbeefcafe&versionId=1";
	const out = redactText(
		`${signed} Authorization: Bearer abc.def.ghi password=hunter2 ${"x".repeat(64)}`,
	);
	expect(out).not.toContain("AKIA123");
	expect(out).not.toContain("deadbeefcafe");
	expect(out).not.toContain("abc.def.ghi");
	expect(out).not.toContain("hunter2");
	expect(out).not.toContain("x".repeat(64));
	expect(out).toContain("X-Amz-Signature=[redacted]");
	expect(
		redactText("a".repeat(20) + " ".repeat(400)).length,
	).toBeLessThanOrEqual(301);
});

test("access log paths drop control characters and are bounded", () => {
	expect(logPath("/fr/post/1\nforged")).toBe("/fr/post/1?forged");
	expect(logPath(`/${"a".repeat(400)}`).length).toBe(161);
	const line = JSON.parse(jsonLine("request", { path: "/fr", status: 200 }));
	expect(line).toMatchObject({ event: "request", path: "/fr", status: 200 });
});

test("metrics windows report status classes, percentiles and saturation, then reset", () => {
	let now = 0;
	const metrics = createRequestMetrics(() => now);
	for (let i = 1; i <= 100; i++) {
		metrics.begin();
		metrics.end(i === 100 ? 503 : i % 10 === 0 ? 404 : 200, i);
	}
	metrics.begin();
	metrics.begin();
	now = 60_000;
	const window = metrics.flush();
	expect(window).toMatchObject({
		windowMs: 60_000,
		requests: 100,
		status: { "2xx": 90, "3xx": 0, "4xx": 9, "5xx": 1 },
		errorRate: 0.01,
		p50Ms: 50,
		p95Ms: 95,
		p99Ms: 99,
		maxMs: 100,
		inflight: 2,
		maxInflight: 2,
	});
	expect(metrics.flush()).toMatchObject({ requests: 0, p95Ms: 0, inflight: 2 });
});

test("thresholds need a minimum sample for rates and always watch resources", () => {
	const base = {
		windowMs: 60_000,
		status: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 5 },
		p50Ms: 10,
		p99Ms: 5000,
		maxMs: 5000,
		inflight: 0,
	};
	const quiet = {
		...base,
		requests: 5,
		errorRate: 1,
		p95Ms: 5000,
		maxInflight: 1,
	};
	expect(breachedThresholds(quiet, { rssBytes: 1, heapUsedBytes: 1 })).toEqual(
		[],
	);
	const busy = {
		...base,
		requests: 200,
		errorRate: 0.05,
		p95Ms: 2000,
		maxInflight: 100,
	};
	expect(
		breachedThresholds(busy, {
			rssBytes: 2 * 1024 ** 3,
			heapUsedBytes: 1,
			tmpFreeBytes: 10,
		}),
	).toEqual([
		"error_rate",
		"latency_p95",
		"saturation_inflight",
		"memory_rss",
		"storage_tmp_free",
	]);
});

test("client error beacons are same-origin, bounded, typed and redacted", () => {
	const body = (value: unknown) => JSON.stringify(value);
	const report = {
		kind: "error",
		message: "TypeError: x token=abcdef",
		path: "/fr/post/1?returnTo=/secret#frag",
	};
	expect(parseClientError(body(report), origin, null, origin)).toEqual({
		kind: "error",
		message: "TypeError: x token=[redacted]",
		path: "/fr/post/1",
	});
	expect(
		parseClientError(body(report), null, "same-origin", origin),
	).toBeDefined();
	expect(
		parseClientError(body(report), "https://evil.example", null, origin),
	).toBeUndefined();
	expect(
		parseClientError(body(report), null, "cross-site", origin),
	).toBeUndefined();
	expect(parseClientError(body(report), null, null, origin)).toBeUndefined();
	expect(
		parseClientError(body({ ...report, kind: "log" }), origin, null, origin),
	).toBeUndefined();
	expect(parseClientError("{", origin, null, origin)).toBeUndefined();
	expect(
		parseClientError("x".repeat(5000), origin, null, origin),
	).toBeUndefined();
});

test("rate limit resets per window", () => {
	let now = 0;
	const allow = createRateLimit(2, 1000, () => now);
	expect([allow(), allow(), allow()]).toEqual([true, true, false]);
	now = 1000;
	expect(allow()).toBe(true);
});
