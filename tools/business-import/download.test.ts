import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { isPublicAddress, prepareMedia } from "./download";
import type { MediaPlan } from "./media-plan";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const asset = {
	id: "one",
	ownerId: "owner",
	postId: "post",
	kind: "thumbnail",
	role: "delivery",
	mimetype: "image/jpeg",
	fetchUrl: "https://cdn.example.test/a",
	provenance: {
		source: "media",
		id: "one",
		type: "mainVideo",
		url: "https://cdn.example.test/a",
		mimetype: "image/jpeg",
	},
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
} as const;
const plan = (assets: MediaPlan["assets"] = [asset]): MediaPlan => ({
	bucket: "bucket",
	prefix: "private/",
	assets: [...assets],
});
const address = { address: "8.8.8.8", family: 4 };
describe("private media download", () => {
	test("rejects private, reserved and mapped addresses", () => {
		for (const ip of [
			"127.0.0.1",
			"10.0.0.1",
			"169.254.169.254",
			"192.0.2.1",
			"198.51.100.1",
			"203.0.113.1",
			"::ffff:8.8.8.8",
			"::1",
		])
			expect(isPublicAddress(ip)).toBe(false);
		expect(isPublicAddress("8.8.8.8")).toBe(true);
		expect(isPublicAddress("2607:f8b0:4004:800::200e")).toBe(true);
		expect(isPublicAddress("fc00::1")).toBe(false);
	});
	test("pins address, deduplicates, verifies bytes and records private ledger", async () => {
		const directory = await mkdtemp(join(tmpdir(), "media-download-"));
		let requests = 0;
		try {
			const result = await prepareMedia(
				plan([asset, { ...asset, id: "two" }]),
				{
					directory,
					allowedHosts: ["cdn.example.test"],
					dependencies: {
						lookup: async () => [address],
						request: async (_url, pinned) => {
							expect(pinned).toEqual(address);
							requests++;
							return { status: 200, body: Readable.from([jpeg]) };
						},
					},
				},
			);
			expect(result.ready).toBe(true);
			expect(requests).toBe(1);
			expect(result.prepared).toHaveLength(2);
			expect(result.prepared[0]?.path).toBe(result.prepared[1]?.path);
			expect((await stat(result.prepared[0]!.path)).mode & 0o777).toBe(0o600);
			expect((await stat(join(directory, "manifest.json"))).mode & 0o777).toBe(
				0o600,
			);
			expect(
				Object.keys(
					JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))
						.entries,
				),
			).toHaveLength(1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("resumes cached objects without requests and rejects tampering", async () => {
		const directory = await mkdtemp(join(tmpdir(), "media-download-"));
		try {
			let calls = 0;
			const options = {
				directory,
				allowedHosts: ["cdn.example.test"],
				dependencies: {
					lookup: async () => [
						{ address: "2607:f8b0:4004:800::200e", family: 6 },
						address,
					],
					request: async () => {
						calls++;
						return { status: 200, body: Readable.from([jpeg]) };
					},
				},
			};
			const first = await prepareMedia(plan(), options);
			await prepareMedia(plan(), options);
			expect(calls).toBe(1);
			const path = first.prepared[0]?.path;
			if (!path) throw new Error("fixture");
			await writeFile(path, Buffer.from([0xff, 0xd8, 0xff, 9, 9, 9]));
			await expect(prepareMedia(plan(), options)).rejects.toThrow();
			expect(calls).toBe(1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("quarantines inaccessible sources and blocks readiness", async () => {
		const directory = await mkdtemp(join(tmpdir(), "media-download-"));
		try {
			const result = await prepareMedia(plan(), {
				directory,
				allowedHosts: ["cdn.example.test"],
				dependencies: {
					lookup: async () => [address],
					request: async () => ({ status: 403, body: Readable.from([]) }),
				},
			});
			expect(result.ready).toBe(false);
			expect(result.quarantine[0]?.reason).toBe("http_403");
			expect(result.prepared).toHaveLength(0);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("rejects rebinding, unsafe redirects, oversized and incorrect content", async () => {
		const directory = await mkdtemp(join(tmpdir(), "media-download-"));
		try {
			const base = { directory, allowedHosts: ["cdn.example.test"] };
			await expect(
				prepareMedia(plan(), {
					...base,
					dependencies: {
						lookup: async () => [address, { address: "127.0.0.1", family: 4 }],
						request: async () => {
							throw new Error("must not connect");
						},
					},
				}),
			).rejects.toThrow();
			await expect(
				prepareMedia(plan(), {
					...base,
					dependencies: {
						lookup: async () => [address],
						request: async () => ({
							status: 302,
							location: "https://cdn.example.test:443/a",
							body: Readable.from([]),
						}),
					},
				}),
			).rejects.toThrow();
			await expect(
				prepareMedia(plan(), {
					...base,
					maxBytes: 2,
					dependencies: {
						lookup: async () => [address],
						request: async () => ({ status: 200, body: Readable.from([jpeg]) }),
					},
				}),
			).rejects.toThrow();
			await expect(
				prepareMedia(plan(), {
					...base,
					dependencies: {
						lookup: async () => [address],
						request: async () => ({
							status: 200,
							body: Readable.from(["not an image"]),
						}),
					},
				}),
			).rejects.toThrow();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
