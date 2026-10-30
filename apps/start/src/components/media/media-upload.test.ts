import { describe, expect, test } from "bun:test";
import {
	type AllocateAsset,
	MEDIA_PART_BYTES,
	type UploadAsset,
} from "../../lib/media-contract";
import {
	fingerprint,
	MediaTransfer,
	putPart,
	type TransferApi,
	type TransferSnapshot,
	uploadedBytes,
} from "../../lib/media-upload";

function fixture(file: File) {
	let asset: UploadAsset;
	const allocations: AllocateAsset[] = [],
		signatures: number[] = [],
		cancelled: string[] = [];
	let resumed = 0,
		finalized = 0;
	const api: TransferApi = {
		allocateAsset: async ({ data }) => {
			allocations.push(data);
			asset = {
				id: crypto.randomUUID(),
				kind: data.kind,
				state: "UPLOADING",
				sha256: data.sha256,
				byteSize: data.byteSize,
				partBytes: MEDIA_PART_BYTES,
				parts: [],
			};
			return { ok: true, value: asset };
		},
		resumeAsset: async () => {
			resumed++;
			return { ok: true, value: asset };
		},
		signAssetPart: async ({ data }) => {
			signatures.push(data.partNumber);
			return {
				ok: true,
				value: {
					url: `https://upload.invalid/${data.partNumber}/${signatures.length}`,
				},
			};
		},
		finalizeAsset: async () => {
			finalized++;
			asset = { ...asset, state: "READY" };
			return { ok: true, value: asset };
		},
		cancelAsset: async ({ data }) => {
			cancelled.push(data.assetId);
			return { ok: true, value: { cancelled: true } };
		},
	};
	return {
		file,
		api,
		allocations,
		signatures,
		cancelled,
		get asset() {
			return asset;
		},
		get resumed() {
			return resumed;
		},
		get finalized() {
			return finalized;
		},
	};
}
const video = (size: number) =>
	new File([new Uint8Array(size)], "match.mp4", { type: "video/mp4" });
describe("client media transfers", () => {
	test("fingerprints selected bytes using SHA-256", async () => {
		expect(await fingerprint(new Blob(["abc"]))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
	test("uploads exact sequential slices, reports real progress and finalizes once", async () => {
		const f = fixture(video(MEDIA_PART_BYTES + 7)),
			sizes: number[] = [],
			states: TransferSnapshot[] = [];
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			(state) => states.push(state),
			async (_url, blob, _signal, progress) => {
				sizes.push(blob.size);
				progress(blob.size / 2);
				progress(blob.size);
			},
		);
		const first = transfer.start(),
			second = transfer.start();
		expect(first).toBe(second);
		expect(await first).toBe(f.asset.id);
		expect(sizes).toEqual([MEDIA_PART_BYTES, 7]);
		expect(f.allocations).toHaveLength(1);
		expect(f.allocations[0]?.sha256).toBe(await fingerprint(f.file));
		expect(f.signatures).toEqual([1, 2]);
		expect(
			states.some((s) => s.phase === "uploading" && s.progress === 50),
		).toBe(true);
		expect(states.at(-1)?.phase).toBe("ready");
		expect(f.finalized).toBe(1);
	});
	test("retry skips acknowledged matching parts and fetches fresh signatures", async () => {
		const f = fixture(video(MEDIA_PART_BYTES + 7)),
			states: TransferSnapshot[] = [];
		let fail = true;
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			(state) => states.push(state),
			async (url, blob) => {
				if (url.includes("/2/") && fail) {
					fail = false;
					throw new Error("network failure");
				}
				f.asset.parts.push({
					number: Number(new URL(url).pathname.split("/")[1]),
					bytes: blob.size,
					etag: "received",
				});
			},
		);
		expect(await transfer.start()).toBeUndefined();
		expect(states.at(-1)?.phase).toBe("error");
		expect(await transfer.start()).toBe(f.asset.id);
		expect(f.allocations).toHaveLength(1);
		expect(f.resumed).toBe(1);
		expect(f.signatures).toEqual([1, 2, 2]);
	});
	test("pause aborts active transfer and cancel invokes authenticated cancellation", async () => {
		const f = fixture(video(17));
		let started!: () => void;
		const uploading = new Promise<void>((resolve) => {
			started = resolve;
		});
		let aborted = false;
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			() => {},
			async (_url, _blob, signal) => {
				started();
				await new Promise<void>((_resolve, reject) =>
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					}),
				);
			},
		);
		const running = transfer.start();
		await uploading;
		await transfer.cancel();
		await running;
		expect(aborted).toBe(true);
		expect(f.cancelled).toEqual([f.asset.id]);
		expect(f.finalized).toBe(0);
		expect(await transfer.start()).toBeUndefined();
	});
	test("rejects mismatching resumed bytes before signing", async () => {
		const f = fixture(video(17));
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			() => {},
			async () => {
				throw new Error("offline");
			},
		);
		await transfer.start();
		f.asset.sha256 = "f".repeat(64);
		await transfer.start();
		expect(f.signatures).toEqual([1]);
		expect(f.finalized).toBe(0);
	});
	test("a terminal READY resume does not upload again", async () => {
		const f = fixture(video(17));
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			() => {},
			async () => {},
		);
		await transfer.start();
		await transfer.start();
		expect(f.signatures).toEqual([1]);
		expect(f.finalized).toBe(1);
	});
	test("retries FINALIZING without requesting another part signature", async () => {
		const f = fixture(video(17));
		const finalize = f.api.finalizeAsset;
		let fail = true;
		f.api.finalizeAsset = async (input) => {
			if (fail) {
				fail = false;
				f.asset.state = "FINALIZING";
				return { ok: false, error: "unavailable" };
			}
			return finalize(input);
		};
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			() => {},
			async () => {},
		);
		expect(await transfer.start()).toBeUndefined();
		expect(await transfer.start()).toBe(f.asset.id);
		expect(f.signatures).toEqual([1]);
		expect(f.allocations).toHaveLength(1);
	});
	test("lost allocation responses reuse the same request ID and fingerprint", async () => {
		const f = fixture(video(17)),
			allocate = f.api.allocateAsset;
		const requests: AllocateAsset[] = [];
		f.api.allocateAsset = async (input) => {
			requests.push(input.data);
			if (requests.length === 1) throw new Error("response lost");
			return allocate(input);
		};
		const transfer = new MediaTransfer(
			f.file,
			"video",
			f.api,
			() => {},
			async () => {},
		);
		await transfer.start();
		await transfer.start();
		expect(requests[0]).toEqual(requests[1]);
		expect(f.finalized).toBe(1);
	});
	test("counts only matching complete part sizes", () => {
		expect(
			uploadedBytes({
				id: "id",
				kind: "video",
				state: "UPLOADING",
				byteSize: MEDIA_PART_BYTES + 9,
				partBytes: MEDIA_PART_BYTES,
				sha256: "",
				parts: [
					{ number: 1, bytes: 3, etag: "bad" },
					{ number: 2, bytes: 9, etag: "ok" },
					{ number: 99, bytes: 500, etag: "extra" },
				],
			}),
		).toBe(9);
	});
	test("XHR reports uploaded bytes and uses the native abort handle", async () => {
		const Original = globalThis.XMLHttpRequest;
		let xhr!: FakeXHR;
		class FakeXHR {
			upload = { onprogress: (_event: { loaded: number }) => {} };
			status = 200;
			timeout = 0;
			onload = () => {};
			onerror = () => {};
			onabort = () => {};
			ontimeout = () => {};
			open(method: string, url: string) {
				expect(method).toBe("PUT");
				expect(url).toBe("https://upload.invalid");
			}
			send(_bytes: Blob) {
				xhr = this;
			}
			abort() {
				this.onabort();
			}
		}
		try {
			globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
			const controller = new AbortController(),
				progress: number[] = [];
			const promise = putPart(
				"https://upload.invalid",
				new Blob(["abc"]),
				controller.signal,
				(bytes) => progress.push(bytes),
			);
			xhr.upload.onprogress({ loaded: 2 });
			expect(progress).toEqual([2]);
			controller.abort();
			await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		} finally {
			globalThis.XMLHttpRequest = Original;
		}
	});
});
