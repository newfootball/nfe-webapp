import { createHash, randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createReadStream, createWriteStream } from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import https from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { MediaPlan } from "./media-plan";

export type PreparedAsset = {
	assetId: string;
	path: string;
	byteSize: number;
	sha256: string;
	mimetype: string;
};
export type QuarantinedAsset = {
	assetId: string;
	urlHash: string;
	reason: "http_403" | "http_404";
};
type Response = { status: number; location?: string; body: Readable };
type Dependencies = {
	lookup: (host: string) => Promise<{ address: string; family: number }[]>;
	request: (
		url: URL,
		address: { address: string; family: number },
	) => Promise<Response>;
};
const fail = (): never => {
	throw new Error("media_download_failed");
};
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
// IPv6 is accepted only from globally routed unicast space; it is never selected for connection.
function publicV6(address: string): boolean {
	if (isIP(address) !== 6 || address.includes(".")) return false;
	const parts = address.toLowerCase().split("::");
	if (parts.length > 2) return false;
	const left = parts[0] ? parts[0].split(":") : [];
	const right = parts[1] ? parts[1].split(":") : [];
	const groups = [
		...left,
		...Array(parts.length === 2 ? 8 - left.length - right.length : 0).fill("0"),
		...right,
	].map((x) => Number.parseInt(x, 16));
	if (groups.length !== 8 || groups.some((x) => !Number.isInteger(x)))
		return false;
	const [a = 0, b = 0] = groups;
	return (
		a >= 0x2000 &&
		a <= 0x3fff &&
		a !== 0x2002 &&
		a !== 0x3fff &&
		!(a === 0x2001 && (b === 0 || b === 2 || b === 0x10 || b === 0xdb8))
	);
}
export function isPublicAddress(address: string): boolean {
	if (isIP(address) === 6) return publicV6(address);
	if (isIP(address) !== 4) return false;
	const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
		(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
		(a === 203 && b === 0 && c === 113)
	);
}
const defaults: Dependencies = {
	lookup: (host) => dnsLookup(host, { all: true, verbatim: true }),
	request: (url, address) =>
		new Promise((resolve, reject) => {
			const req = https.get(
				url,
				{
					lookup: (_hostname, lookupOptions, callback) => {
						if (lookupOptions.all) callback(null, [address]);
						else callback(null, address.address, address.family);
					},
				},
				(res) =>
					resolve({
						status: res.statusCode ?? 0,
						location: res.headers.location,
						body: res,
					}),
			);
			req.on("error", reject);
			req.setTimeout(30000, () => req.destroy());
		}),
};
function safeUrl(value: string, hosts: Set<string>): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return fail();
	}
	if (
		!/^https:\/\/[^/?#:@]+(?:[/?#]|$)/i.test(value) ||
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		isIP(url.hostname) ||
		!hosts.has(url.hostname.toLowerCase())
	)
		return fail();
	return url;
}
function mime(header: Buffer): string {
	if (header.length >= 12 && header.subarray(4, 8).toString() === "ftyp")
		return "video/mp4";
	if (
		header.length >= 12 &&
		header.subarray(0, 4).toString() === "RIFF" &&
		header.subarray(8, 12).toString() === "WEBP"
	)
		return "image/webp";
	if (
		header.length >= 3 &&
		header[0] === 0xff &&
		header[1] === 0xd8 &&
		header[2] === 0xff
	)
		return "image/jpeg";
	if (
		header.length >= 8 &&
		header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
	)
		return "image/png";
	return fail();
}
async function inspect(path: string, maxBytes: number) {
	const digest = createHash("sha256");
	let size = 0;
	let header = Buffer.alloc(0);
	for await (const chunk of createReadStream(path)) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > maxBytes) return fail();
		if (header.length < 32)
			header = Buffer.concat([header, bytes.subarray(0, 32 - header.length)]);
		digest.update(bytes);
	}
	if (!size) return fail();
	return {
		byteSize: size,
		sha256: digest.digest("hex"),
		mimetype: mime(header),
	};
}
export async function prepareMedia(
	plan: MediaPlan,
	options: {
		directory: string;
		allowedHosts: string[];
		maxBytes?: number;
		dependencies?: Dependencies;
	},
) {
	const maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
	if (
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		maxBytes > 512 * 1024 * 1024 ||
		!options.allowedHosts.length
	)
		return fail();
	const hosts = new Set(
		options.allowedHosts.map((host) => {
			if (
				!/^[a-z0-9.-]+$/.test(host) ||
				isIP(host) ||
				host === "localhost" ||
				host.endsWith(".localhost") ||
				host.endsWith(".local")
			)
				return fail();
			return host;
		}),
	);
	const deps = options.dependencies ?? defaults;
	await mkdir(options.directory, { recursive: true, mode: 0o700 });
	await chmod(options.directory, 0o700);
	const cache = join(options.directory, "objects");
	await mkdir(cache, { recursive: true, mode: 0o700 });
	await chmod(cache, 0o700);
	const binding = hash(
		JSON.stringify({ plan, hosts: [...hosts].sort(), maxBytes }),
	);
	type CacheEntry =
		| { sourceUrl: string; byteSize: number; sha256: string; mimetype: string }
		| { sourceUrl: string; reason: "http_403" | "http_404" };
	let ledger: {
		version: 2;
		binding: string;
		entries: Record<string, CacheEntry>;
	};
	const ledgerPath = join(options.directory, "manifest.json");
	try {
		ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
		if (
			ledger.version !== 2 ||
			ledger.binding !== binding ||
			!ledger.entries ||
			typeof ledger.entries !== "object"
		)
			return fail();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fail();
		ledger = { version: 2, binding, entries: {} };
	}
	const saveLedger = async () => {
		const temporary = join(options.directory, `.ledger-${randomUUID()}`);
		try {
			await writeFile(temporary, JSON.stringify(ledger), {
				mode: 0o600,
				flag: "wx",
			});
			await rename(temporary, ledgerPath);
		} finally {
			await rm(temporary, { force: true });
		}
	};
	await saveLedger();
	const prepared: PreparedAsset[] = [];
	const quarantine: QuarantinedAsset[] = [];
	const seen = new Map<
		string,
		Omit<PreparedAsset, "assetId"> | { reason: "http_403" | "http_404" }
	>();
	for (const asset of plan.assets) {
		const urlHash = hash(asset.fetchUrl);
		let result = seen.get(asset.fetchUrl);
		if (!result) {
			let current = safeUrl(asset.fetchUrl, hosts);
			const entry = ledger.entries[urlHash];
			const path = join(cache, urlHash);
			if (entry) {
				if (entry.sourceUrl !== asset.fetchUrl) return fail();
				if ("reason" in entry) {
					if (entry.reason !== "http_403" && entry.reason !== "http_404")
						return fail();
					result = { reason: entry.reason };
				} else {
					const info = await inspect(path, maxBytes);
					if (
						info.sha256 !== entry.sha256 ||
						info.byteSize !== entry.byteSize ||
						info.mimetype !== entry.mimetype
					)
						return fail();
					result = { path, ...info };
				}
			} else {
				// An atomic completed object can survive a crash just before its ledger update.
				try {
					result = { path, ...(await inspect(path, maxBytes)) };
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fail();
				}
			}
			if (!result) {
				let response: Response | undefined;
				for (let redirects = 0; redirects <= 5; redirects++) {
					const addresses = await deps.lookup(current.hostname);
					if (
						!addresses.length ||
						addresses.some(
							(item) =>
								isIP(item.address) !== item.family ||
								!isPublicAddress(item.address),
						)
					)
						return fail();
					const ipv4 = addresses.find((item) => item.family === 4);
					if (!ipv4) return fail();
					response = await deps.request(current, ipv4);
					if (response.status >= 300 && response.status < 400) {
						response.body.destroy();
						if (redirects === 5 || !response.location) return fail();
						if (/^(?:https:)?\/\/[^/?#]*:/i.test(response.location))
							return fail();
						current = safeUrl(new URL(response.location, current).href, hosts);
						continue;
					}
					break;
				}
				if (!response) return fail();
				if (response.status === 403 || response.status === 404) {
					response.body.destroy();
					result = {
						reason: response.status === 403 ? "http_403" : "http_404",
					};
				} else {
					if (response.status !== 200) {
						response.body.destroy();
						return fail();
					}
					const temporary = join(cache, `.tmp-${randomUUID()}`);
					let count = 0;
					try {
						await pipeline(
							response.body,
							new Transform({
								transform(chunk, _encoding, callback) {
									count += chunk.length;
									callback(count > maxBytes ? new Error("limit") : null, chunk);
								},
							}),
							createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
						);
						const info = await inspect(temporary, maxBytes);
						await rename(temporary, path);
						await chmod(path, 0o600);
						result = { path, ...info };
					} finally {
						await rm(temporary, { force: true });
					}
				}
			}
			ledger.entries[urlHash] =
				"reason" in result
					? { sourceUrl: asset.fetchUrl, reason: result.reason }
					: {
							sourceUrl: asset.fetchUrl,
							byteSize: result.byteSize,
							sha256: result.sha256,
							mimetype: result.mimetype,
						};
			await saveLedger();
			seen.set(asset.fetchUrl, result);
		}
		if ("reason" in result)
			quarantine.push({ assetId: asset.id, urlHash, reason: result.reason });
		else {
			if (asset.mimetype !== null && asset.mimetype !== result.mimetype)
				return fail();
			if (
				asset.mimetype === null &&
				!result.mimetype.startsWith(
					asset.kind === "video" ? "video/" : "image/",
				)
			)
				return fail();
			prepared.push({ assetId: asset.id, ...result });
		}
	}
	return { prepared, quarantine, ready: quarantine.length === 0 };
}
