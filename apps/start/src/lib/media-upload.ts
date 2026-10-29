import {
	type AllocateAsset,
	type AssetKind,
	type AssetRequest,
	MEDIA_PART_BYTES,
	type MediaResult,
	type PartRequest,
	type UploadAsset,
} from "./media-contract";

export type TransferApi = {
	allocateAsset: (input: {
		data: AllocateAsset;
	}) => Promise<MediaResult<UploadAsset>>;
	resumeAsset: (input: {
		data: AssetRequest;
	}) => Promise<MediaResult<UploadAsset>>;
	signAssetPart: (input: {
		data: PartRequest;
	}) => Promise<MediaResult<{ url: string }>>;
	finalizeAsset: (input: {
		data: AssetRequest;
	}) => Promise<MediaResult<UploadAsset>>;
	cancelAsset: (input: {
		data: AssetRequest;
	}) => Promise<MediaResult<{ cancelled: true }>>;
};
export type TransferPhase =
	| "idle"
	| "hashing"
	| "uploading"
	| "validating"
	| "paused"
	| "ready"
	| "cancelled"
	| "error";
export type TransferSnapshot = {
	phase: TransferPhase;
	progress: number;
	error?: string;
	assetId?: string;
};
export class MediaUploadError extends Error {}
export function unwrapMedia<T>(result: MediaResult<T>): T {
	if (!result.ok) throw new MediaUploadError(result.error);
	return result.value;
}
export async function fingerprint(file: Blob) {
	const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
	return Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
export function uploadedBytes(asset: UploadAsset) {
	const count = Math.ceil(asset.byteSize / MEDIA_PART_BYTES);
	const parts = new Map(asset.parts.map((part) => [part.number, part.bytes]));
	let bytes = 0;
	for (let number = 1; number <= count; number++) {
		const expected = Math.min(
			MEDIA_PART_BYTES,
			asset.byteSize - (number - 1) * MEDIA_PART_BYTES,
		);
		if (parts.get(number) === expected) bytes += expected;
	}
	return bytes;
}
export function putPart(
	url: string,
	bytes: Blob,
	signal: AbortSignal,
	progress: (bytes: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const abort = () => xhr.abort();
		const finish = (error?: Error) => {
			signal.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve();
		};
		xhr.open("PUT", url);
		xhr.upload.onprogress = (event) =>
			progress(Math.min(event.loaded, bytes.size));
		xhr.onload = () =>
			finish(
				xhr.status >= 200 && xhr.status < 300
					? undefined
					: new MediaUploadError("unavailable"),
			);
		xhr.onerror = () => finish(new MediaUploadError("unavailable"));
		xhr.onabort = () => finish(new DOMException("Aborted", "AbortError"));
		xhr.ontimeout = () => finish(new MediaUploadError("unavailable"));
		xhr.timeout = 120_000;
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) {
			finish(new DOMException("Aborted", "AbortError"));
			return;
		}
		xhr.send(bytes);
	});
}
// A transfer is owned by a mounted, identity-keyed component. Nothing is persisted.
export class MediaTransfer {
	private asset: UploadAsset | undefined;
	private sha256: string | undefined;
	private requestId = crypto.randomUUID();
	private controller: AbortController | undefined;
	private running: Promise<string | undefined> | undefined;
	private cancelled = false;
	constructor(
		readonly file: File,
		readonly kind: AssetKind,
		private api: TransferApi,
		private update: (state: TransferSnapshot) => void,
		private put = putPart,
	) {}
	pause() {
		this.controller?.abort();
	}
	start(): Promise<string | undefined> {
		if (this.running) return this.running;
		if (this.cancelled) return Promise.resolve(undefined);
		this.controller = new AbortController();
		this.running = this.run(this.controller.signal).finally(() => {
			this.running = undefined;
		});
		return this.running;
	}
	async cancel() {
		this.cancelled = true;
		this.pause();
		await this.running;
		try {
			if (this.asset)
				unwrapMedia(
					await this.api.cancelAsset({ data: { assetId: this.asset.id } }),
				);
			this.update({ phase: "cancelled", progress: 0 });
		} catch (error) {
			// Keep the known allocation available if cancellation itself needs retry.
			this.cancelled = false;
			throw error;
		}
	}
	private emit(phase: TransferPhase, bytes = 0) {
		this.update({
			phase,
			progress: Math.round((bytes / this.file.size) * 100),
			assetId: this.asset?.id,
		});
	}
	private async initialize(signal: AbortSignal) {
		if (
			!this.file.size ||
			this.file.size > 512 * 1024 * 1024 ||
			this.file.type !== (this.kind === "video" ? "video/mp4" : "image/webp")
		)
			throw new MediaUploadError("invalid");
		this.emit("hashing");
		this.sha256 ??= await fingerprint(this.file);
		signal.throwIfAborted();
		this.asset = unwrapMedia(
			this.asset
				? await this.api.resumeAsset({ data: { assetId: this.asset.id } })
				: await this.api.allocateAsset({
						data: {
							requestId: this.requestId,
							kind: this.kind,
							byteSize: this.file.size,
							sha256: this.sha256,
							mimetype: this.kind === "video" ? "video/mp4" : "image/webp",
						},
					}),
		);
		signal.throwIfAborted();
		const asset = this.asset;
		if (
			asset.sha256 !== this.sha256 ||
			asset.byteSize !== this.file.size ||
			asset.kind !== this.kind ||
			asset.partBytes !== MEDIA_PART_BYTES
		)
			throw new MediaUploadError("conflict");
		if (asset.state === "REJECTED") throw new MediaUploadError("invalid");
		if (["ATTACHED", "CANCELLED"].includes(asset.state))
			throw new MediaUploadError("conflict");
		return asset;
	}
	private async uploadParts(asset: UploadAsset, signal: AbortSignal) {
		let completed = uploadedBytes(asset);
		for (
			let offset = 0, partNumber = 1;
			offset < this.file.size;
			offset += MEDIA_PART_BYTES, partNumber++
		) {
			signal.throwIfAborted();
			const slice = this.file.slice(offset, offset + MEDIA_PART_BYTES);
			if (
				asset.parts.some(
					(part) => part.number === partNumber && part.bytes === slice.size,
				)
			)
				continue;
			this.emit("uploading", completed);
			const { url } = unwrapMedia(
				await this.api.signAssetPart({
					data: { assetId: asset.id, partNumber },
				}),
			);
			signal.throwIfAborted();
			await this.put(url, slice, signal, (bytes) =>
				this.emit("uploading", completed + bytes),
			);
			completed += slice.size;
		}
	}
	private assertReady(asset: UploadAsset) {
		if (asset.state !== "READY")
			throw new MediaUploadError(
				asset.state === "REJECTED" ? "invalid" : "unavailable",
			);
	}
	private async run(signal: AbortSignal) {
		try {
			const asset = await this.initialize(signal);
			if (asset.state !== "READY") {
				// A finalization retry must not request upload signatures again.
				if (asset.state === "UPLOADING") await this.uploadParts(asset, signal);
				else if (asset.state !== "FINALIZING")
					throw new MediaUploadError("unavailable");
				signal.throwIfAborted();
				this.emit("validating", this.file.size);
				this.asset = unwrapMedia(
					await this.api.finalizeAsset({ data: { assetId: asset.id } }),
				);
				signal.throwIfAborted();
				this.assertReady(this.asset);
			}
			this.emit("ready", this.file.size);
			return asset.id;
		} catch (error) {
			this.update({
				phase: signal.aborted ? "paused" : "error",
				progress: this.asset
					? Math.round((uploadedBytes(this.asset) / this.file.size) * 100)
					: 0,
				assetId: this.asset?.id,
				error:
					error instanceof MediaUploadError ? error.message : "unavailable",
			});
			return undefined;
		}
	}
}
