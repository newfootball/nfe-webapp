import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
	AbortMultipartUploadCommand,
	type CORSRule,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetBucketCorsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	ListPartsCommand,
	PutBucketCorsCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
	browserTransfers,
	browserVideo,
	openBrowser,
	resumeBrowser,
} from "./b2-browser.pw";
import {
	allowedSignature,
	assert,
	BUCKET,
	ENDPOINT,
	REGION,
} from "./b2-guards";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		run: { type: "boolean" },
		"configure-cors": { type: "boolean" },
		"env-file": { type: "string" },
	},
	strict: true,
});
if (!values.run) {
	console.error(
		"B2 runtime not_run: opt in with --run --env-file <protected file> [--configure-cors]",
	);
	process.exit(0);
}
assert(values["env-file"], "explicit_env_file_required");
// Read only the six authorized values; never load arbitrary parent environment into Bun.
const permitted = new Set([
	"B2_APPLICATION_KEY_ID",
	"B2_APPLICATION_KEY",
	"B2_BUCKET_ID",
	"B2_BUCKET_NAME",
	"B2_REGION",
	"B2_ENDPOINT",
]);
const config: Record<string, string> = {};
for (const line of (await Bun.file(values["env-file"]).text()).split("\n")) {
	const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
	if (match && permitted.has(match[1]))
		config[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
}
assert(
	[...permitted].every((name) => config[name]),
	"missing_b2_configuration",
);
assert(
	config.B2_BUCKET_NAME === BUCKET &&
		config.B2_REGION === REGION &&
		config.B2_ENDPOINT === ENDPOINT,
	"unauthorized_bucket_or_endpoint",
);
const client = new S3Client({
	endpoint: ENDPOINT,
	region: REGION,
	forcePathStyle: true,
	credentials: {
		accessKeyId: config.B2_APPLICATION_KEY_ID,
		secretAccessKey: config.B2_APPLICATION_KEY,
	},
	maxAttempts: 2,
	requestHandler: { requestTimeout: 20000, connectionTimeout: 10000 },
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
});
const prefix = `nfe-migration-probe/${randomUUID()}/`;
const keys = Object.fromEntries(
	["small", "multipart", "abort", "video"].map((name) => [
		name,
		`${prefix}${name}${name === "video" ? ".mp4" : ".bin"}`,
	]),
);
const ownedKeys = new Set(Object.values(keys));
const uploads = new Map<string, string>();
const nonce = randomUUID();
const report: {
	status: string;
	executedAt: string;
	runtime: object;
	checks: Record<string, unknown>;
	failure?: string;
} = {
	status: "running",
	executedAt: new Date().toISOString(),
	runtime: {
		bun: Bun.version,
		sdk: "3.1159.0",
		playwright: "1.64.1",
		endpoint: "B2 S3 eu-central-003",
		fixture: "synthetic only",
	},
	checks: {},
};
const evidence = new URL("./evidence/b2-compatibility.json", import.meta.url);
const sha = (data: Uint8Array) =>
	createHash("sha256").update(data).digest("hex");
const fixtures = {
	small: new Uint8Array(4096).map((_, i) => i % 251),
	multipart: new Uint8Array(10 * 1024 * 1024).map((_, i) => (i * 17 + 3) % 251),
	video: new Uint8Array(),
};
let server: ReturnType<typeof Bun.serve> | undefined;
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
let temp: string | undefined;
let stage = "preflight";
let deletedUrl: string | undefined;
let signatureCount = 0;
const signed = (key: string, expiresIn = 120) =>
	getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
		expiresIn,
	});
const fetchSafe = (url: string, init?: RequestInit) =>
	fetch(url, {
		...init,
		redirect: "error",
		signal: AbortSignal.timeout(20000),
	});
const statusOnly = async (url: string, init?: RequestInit) => {
	const response = await fetchSafe(url, init);
	await response.arrayBuffer();
	return response.status;
};
const denied = (status: number) => status === 401 || status === 403;

// Native account authorization is only used to read this one bucket's private flag/properties.
// No bucket/account/key mutation is made through the native API.
async function bucketSnapshot() {
	const authResponse = await fetchSafe(
		"https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
		{
			headers: {
				authorization: `Basic ${Buffer.from(`${config.B2_APPLICATION_KEY_ID}:${config.B2_APPLICATION_KEY}`).toString("base64")}`,
			},
		},
	);
	assert(authResponse.ok, "native_authorization_failed");
	const auth = (await authResponse.json()) as {
		accountId: string;
		authorizationToken: string;
		apiInfo: { storageApi: { apiUrl: string } };
	};
	const api = auth.apiInfo.storageApi.apiUrl;
	assert(
		/^https:\/\/api[0-9]+\.backblazeb2\.com$/.test(api),
		"unexpected_native_endpoint",
	);
	const result = await fetchSafe(`${api}/b2api/v4/b2_list_buckets`, {
		method: "POST",
		headers: {
			authorization: auth.authorizationToken,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			accountId: auth.accountId,
			bucketId: config.B2_BUCKET_ID,
			bucketName: BUCKET,
		}),
	});
	assert(result.ok, "bucket_snapshot_failed");
	const { buckets } = (await result.json()) as {
		buckets: Array<Record<string, unknown>>;
	};
	assert(
		buckets.length === 1 &&
			buckets[0].bucketName === BUCKET &&
			buckets[0].bucketId === config.B2_BUCKET_ID &&
			buckets[0].bucketType === "allPrivate",
		"bucket_not_private_or_mismatch",
	);
	const { corsRules: _cors, revision: _revision, ...properties } = buckets[0];
	return JSON.stringify(properties);
}
async function listVersions() {
	const response = await client.send(
		new ListObjectVersionsCommand({
			Bucket: BUCKET,
			Prefix: prefix,
			MaxKeys: 100,
		}),
	);
	assert(!response.IsTruncated, "cleanup_version_bound_exceeded");
	return [...(response.Versions ?? []), ...(response.DeleteMarkers ?? [])];
}
async function listUploads() {
	const response = await client.send(
		new ListMultipartUploadsCommand({
			Bucket: BUCKET,
			Prefix: prefix,
			MaxUploads: 100,
		}),
	);
	assert(!response.IsTruncated, "cleanup_upload_bound_exceeded");
	return response.Uploads ?? [];
}
try {
	const before = await bucketSnapshot();
	assert(
		(await listVersions()).length === 0 && (await listUploads()).length === 0,
		"run_prefix_not_empty",
	);
	temp = await mkdtemp(join(tmpdir(), "nfe-b2-probe-"));
	const videoFile = join(temp, "synthetic.mp4");
	assert(Bun.which("ffmpeg"), "ffmpeg_required_no_video_fallback_tested");
	const ffmpeg = Bun.spawn(
		[
			"ffmpeg",
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=320x180:rate=24",
			"-t",
			"6",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			"-an",
			videoFile,
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	assert((await ffmpeg.exited) === 0, "synthetic_video_generation_failed");
	fixtures.video = new Uint8Array(await Bun.file(videoFile).arrayBuffer());
	assert(fixtures.video.length < 2 * 1024 * 1024, "video_fixture_too_large");
	report.checks.fixtures = Object.fromEntries(
		Object.entries(fixtures).map(([name, bytes]) => [
			name,
			{ bytes: bytes.length, sha256: sha(bytes) },
		]),
	);
	server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		maxRequestBodySize: 2048,
		async fetch(request) {
			try {
				const url = new URL(request.url);
				const origin = `http://127.0.0.1:${server?.port}`;
				if (request.headers.get("host") !== `127.0.0.1:${server?.port}`)
					return new Response(null, { status: 403 });
				const headers = {
					"cache-control": "no-store",
					"referrer-policy": "no-referrer",
					"content-security-policy": `default-src 'self'; connect-src 'self' ${ENDPOINT}; media-src ${ENDPOINT}; script-src 'none'; frame-ancestors 'none'`,
				};
				if (url.pathname === "/" && request.method === "GET")
					return new Response(
						"<!doctype html><html lang=en><title>Synthetic B2 probe</title><body>B2 synthetic fixture probe</body></html>",
						{ headers: { ...headers, "content-type": "text/html" } },
					);
				if (request.headers.get("x-probe-nonce") !== nonce)
					return new Response(null, { status: 403 });
				if (url.pathname.startsWith("/fixture/") && request.method === "GET") {
					const name = url.pathname.slice(9);
					if (!Object.hasOwn(fixtures, name))
						return new Response(null, { status: 404 });
					return new Response(fixtures[name as keyof typeof fixtures], {
						headers,
					});
				}
				if (
					url.pathname !== "/sign" ||
					request.method !== "POST" ||
					request.headers.get("origin") !== origin
				)
					return new Response(null, { status: 403 });
				const value: unknown = await request.json();
				if (
					!allowedSignature(value, ownedKeys, uploads) ||
					++signatureCount > 40
				)
					return new Response(null, { status: 400 });
				const input = { Bucket: BUCKET, Key: value.key };
				const command =
					value.action === "part"
						? new UploadPartCommand({
								...input,
								UploadId: value.uploadId,
								PartNumber: value.partNumber,
							})
						: value.action === "put"
							? new PutObjectCommand({
									...input,
									ContentType:
										value.key === keys.video
											? "video/mp4"
											: "application/octet-stream",
								})
							: value.action === "head"
								? new HeadObjectCommand(input)
								: new GetObjectCommand(input);
				const urlSigned =
					command instanceof UploadPartCommand
						? await getSignedUrl(client, command, { expiresIn: 120 })
						: command instanceof PutObjectCommand
							? await getSignedUrl(client, command, { expiresIn: 120 })
							: command instanceof HeadObjectCommand
								? await getSignedUrl(client, command, { expiresIn: 120 })
								: await getSignedUrl(client, command, { expiresIn: 120 });
				return Response.json({ url: urlSigned }, { headers });
			} catch {
				return new Response(null, { status: 400 });
			}
		},
	});
	const origin = `http://127.0.0.1:${server.port}`;
	stage = "cors";
	const rule = {
		ID: "nfe-local-probe",
		AllowedOrigins: [
			origin,
			`http://localhost:${server.port}`,
			"http://localhost:3501",
			"http://127.0.0.1:3501",
		],
		AllowedMethods: ["PUT", "GET", "HEAD"],
		AllowedHeaders: ["content-type", "range"],
		ExposeHeaders: ["ETag", "Content-Range", "Accept-Ranges"],
		MaxAgeSeconds: 0,
	};
	// B2 does not round-trip the S3 CORS rule ID; identify only this exact local rule shape.
	const isProbeRule = (item: CORSRule) => {
		const equal = (actual: string[] | undefined, expected: string[]) =>
			JSON.stringify((actual ?? []).map((v) => v.toLowerCase()).sort()) ===
			JSON.stringify(expected.map((v) => v.toLowerCase()).sort());
		return (
			item.AllowedOrigins?.length === 4 &&
			item.AllowedOrigins.includes("http://localhost:3501") &&
			item.AllowedOrigins.includes("http://127.0.0.1:3501") &&
			item.AllowedOrigins.every((v) =>
				/^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(v),
			) &&
			equal(item.AllowedMethods, rule.AllowedMethods) &&
			equal(item.AllowedHeaders, rule.AllowedHeaders) &&
			equal(item.ExposeHeaders, rule.ExposeHeaders) &&
			item.MaxAgeSeconds === 0
		);
	};
	let cors: CORSRule[];
	try {
		cors =
			(await client.send(new GetBucketCorsCommand({ Bucket: BUCKET })))
				.CORSRules ?? [];
	} catch (error) {
		assert(
			["NoSuchCORSConfiguration", "NoSuchCorsConfiguration"].includes(
				(error as { name: string }).name,
			) &&
				(error as { $metadata?: { httpStatusCode?: number } }).$metadata
					?.httpStatusCode === 404,
			"read_cors_failed",
		);
		cors = [];
	}
	if (values["configure-cors"])
		await client.send(
			new PutBucketCorsCommand({
				Bucket: BUCKET,
				CORSConfiguration: {
					CORSRules: [...cors.filter((item) => !isProbeRule(item)), rule],
				},
			}),
		);
	const configured =
		(await client.send(new GetBucketCorsCommand({ Bucket: BUCKET })))
			.CORSRules ?? [];
	assert(
		configured.some(
			(item) => isProbeRule(item) && item.AllowedOrigins?.includes(origin),
		),
		"cors_not_configured_for_run_origin",
	);
	assert(
		(await bucketSnapshot()) === before,
		"non_cors_bucket_properties_changed",
	);
	report.checks.cors = {
		status: "passed",
		privateBeforeAndAfter: true,
		otherPropertiesUnchanged: true,
		origins: rule.AllowedOrigins,
		methods: rule.AllowedMethods,
		allowedHeaders: rule.AllowedHeaders,
		exposedHeaders: rule.ExposeHeaders,
	};
	stage = "signer_guards";
	const signRequest = (body: object, token: string = nonce) =>
		statusOnly(`${origin}/sign`, {
			method: "POST",
			headers: {
				origin,
				"x-probe-nonce": token,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});
	assert(
		(await signRequest({ action: "get", key: keys.small }, "wrong")) === 403,
		"nonce_guard_failed",
	);
	assert(
		(await signRequest({ action: "get", key: `${prefix}unowned` })) === 400,
		"object_guard_failed",
	);
	assert(
		(await signRequest({
			action: "part",
			key: keys.multipart,
			uploadId: "unowned",
			partNumber: 1,
		})) === 400,
		"upload_guard_failed",
	);
	report.checks.signerGuards = {
		status: "passed",
		missingNonce: 403,
		unownedObject: 400,
		unownedUpload: 400,
	};
	for (const key of [keys.multipart, keys.abort]) {
		const created = await client.send(
			new CreateMultipartUploadCommand({
				Bucket: BUCKET,
				Key: key,
				ContentType: "application/octet-stream",
			}),
		);
		assert(created.UploadId, "missing_upload_id");
		uploads.set(key, created.UploadId);
	}
	stage = "browser_upload";
	browser = await openBrowser();
	report.runtime = {
		...report.runtime,
		chromium: browser.version(),
		mobile: "Pixel 7 emulation in Chromium, no physical device or Safari/iOS",
	};
	const transfers = await browserTransfers(
		browser,
		origin,
		nonce,
		keys,
		uploads.get(keys.multipart) as string,
		uploads.get(keys.abort) as string,
	);
	assert(
		transfers.smallSha256 === sha(fixtures.small),
		"browser_small_hash_mismatch",
	);
	report.checks.browserTransfer = {
		status: "passed",
		put: transfers.put,
		get: transfers.get,
		head: transfers.head,
		etagExposed: transfers.etagExposed,
		videoPut: transfers.videoPut,
	};
	stage = "multipart_resume";
	const multipartId = uploads.get(keys.multipart) as string;
	const resumed = await client.send(
		new ListPartsCommand({
			Bucket: BUCKET,
			Key: keys.multipart,
			UploadId: multipartId,
		}),
	);
	assert(
		resumed.Parts?.length === 1 &&
			resumed.Parts[0].Size === 5 * 1024 * 1024 &&
			resumed.Parts[0].ETag === transfers.first.ETag,
		"resume_list_parts_failed",
	);
	const parts = await resumeBrowser(
		browser,
		origin,
		nonce,
		keys.multipart,
		multipartId,
	);
	await client.send(
		new CompleteMultipartUploadCommand({
			Bucket: BUCKET,
			Key: keys.multipart,
			UploadId: multipartId,
			MultipartUpload: { Parts: parts },
		}),
	);
	const multipart = await fetchSafe(await signed(keys.multipart));
	const multipartBytes = new Uint8Array(await multipart.arrayBuffer());
	assert(
		multipart.ok && sha(multipartBytes) === sha(fixtures.multipart),
		"completed_multipart_sha256_mismatch",
	);
	const head = await client.send(
		new HeadObjectCommand({ Bucket: BUCKET, Key: keys.multipart }),
	);
	assert(
		head.ContentLength === fixtures.multipart.length,
		"sdk_head_size_mismatch",
	);
	report.checks.multipart = {
		status: "passed",
		parts: 2,
		partBytes: 5 * 1024 * 1024,
		resumedFromListedPart: true,
		newBrowserContext: true,
		retry:
			"intentional same-part replay after successful first upload; no real network fault injected",
		retriedParts: 1,
		completedGet: multipart.status,
		bytes: multipartBytes.length,
		sha256: sha(multipartBytes),
		sdkHead: head.$metadata.httpStatusCode,
		etagUsedAsChecksum: false,
	};
	stage = "abort";
	await client.send(
		new AbortMultipartUploadCommand({
			Bucket: BUCKET,
			Key: keys.abort,
			UploadId: uploads.get(keys.abort),
		}),
	);
	const active = await listUploads();
	assert(
		!active.some((item) => item.UploadId === uploads.get(keys.abort)),
		"abort_upload_still_present",
	);
	let abortCode = "unexpected_success";
	try {
		await client.send(
			new ListPartsCommand({
				Bucket: BUCKET,
				Key: keys.abort,
				UploadId: uploads.get(keys.abort),
			}),
		);
	} catch (error) {
		abortCode = (error as { name: string }).name;
	}
	assert(abortCode === "NoSuchUpload", "aborted_parts_still_accessible");
	report.checks.abort = {
		status: "passed",
		uploadedPartBytes: 5 * 1024 * 1024,
		listPartsCode: abortCode,
		absentFromUploads: true,
	};
	stage = "privacy_expiration";
	const objectUrl = `${ENDPOINT}/${BUCKET}/${keys.small}`;
	const anonymousObject = await statusOnly(objectUrl);
	const anonymousBucket = await statusOnly(
		`${ENDPOINT}/${BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}`,
	);
	assert(
		denied(anonymousObject) && denied(anonymousBucket),
		"anonymous_access_allowed",
	);
	const valid = await signed(keys.small);
	const tampered = new URL(valid);
	tampered.pathname = tampered.pathname.replace("small.bin", "video.mp4");
	const otherObject = await statusOnly(tampered.toString());
	assert(denied(otherObject), "signature_allowed_other_object");
	const expired = await signed(keys.small, 2);
	const beforeExpiry = await statusOnly(expired);
	assert(beforeExpiry === 200, "url_not_valid_before_expiry");
	await Bun.sleep(5000);
	const afterExpiry = await statusOnly(expired);
	assert(denied(afterExpiry), "url_still_valid_after_expiry");
	report.checks.privacy = {
		status: "passed",
		anonymousObject,
		anonymousBucket,
		signedUrlOtherExistingObject: otherObject,
		beforeExpiry,
		afterExpiry,
		expiresInSeconds: 2,
		waitSeconds: 5,
	};
	stage = "video_playback";
	report.checks.videoDesktop = {
		status: "passed",
		...(await browserVideo(browser, origin, nonce, keys.video, false)),
	};
	report.checks.videoMobileEmulation = {
		status: "passed",
		...(await browserVideo(browser, origin, nonce, keys.video, true)),
	};
	deletedUrl = await signed(keys.small);
	report.status = "passed";
} catch (error) {
	report.status = "failed";
	// Exception messages/stacks can embed signed URLs/credentials: publish only controlled stage/name/status.
	report.failure = stage;
	const safeCode =
		error instanceof Error && /^[a-zA-Z_]{1,80}$/.test(error.message)
			? error.message
			: "details_suppressed";
	report.checks.failureCode = safeCode;
	console.error(
		`B2 probe failed at ${stage}; sensitive error details suppressed`,
	);
	const status = (error as { $metadata?: { httpStatusCode?: number } })
		.$metadata?.httpStatusCode;
	if (status) report.checks.failureHttpStatus = status;
} finally {
	try {
		try {
			await browser?.close();
		} finally {
			await server?.stop(true);
		}
		const active = await listUploads();
		let aborted = 0;
		for (const upload of active) {
			assert(
				upload.Key &&
					ownedKeys.has(upload.Key) &&
					upload.UploadId === uploads.get(upload.Key),
				"cleanup_unowned_upload_refused",
			);
			await client.send(
				new AbortMultipartUploadCommand({
					Bucket: BUCKET,
					Key: upload.Key,
					UploadId: upload.UploadId,
				}),
			);
			aborted++;
		}
		let removed = 0;
		for (const version of await listVersions()) {
			assert(
				version.Key && ownedKeys.has(version.Key) && version.VersionId,
				"cleanup_unowned_version_refused",
			);
			await client.send(
				new DeleteObjectCommand({
					Bucket: BUCKET,
					Key: version.Key,
					VersionId: version.VersionId,
				}),
			);
			removed++;
		}
		const versionsLeft = (await listVersions()).length;
		const uploadsLeft = (await listUploads()).length;
		assert(versionsLeft === 0 && uploadsLeft === 0, "cleanup_incomplete");
		const deletedStatus = deletedUrl ? await statusOnly(deletedUrl) : undefined;
		if (deletedUrl)
			assert(deletedStatus === 404, "deleted_object_still_accessible");
		report.checks.cleanup = {
			status: "passed",
			removedVersions: removed,
			abortedUploads: aborted,
			versionsLeft,
			uploadsLeft,
			deletedObject: deletedStatus,
			serverStopped: true,
			browserStopped: true,
			bucketRetained: true,
			corsRetained: true,
		};
	} catch {
		report.status = "failed";
		report.checks.cleanup = { status: "failed", followUpRequired: true };
		console.error(
			"Cleanup failed; rerun-owned prefix retained only in protected local recovery file",
		);
		await Bun.write(
			new URL("./.local/b2-recovery.json", import.meta.url),
			JSON.stringify({ prefix, keys, uploads: [...uploads] }),
		);
		await chmod(new URL("./.local/b2-recovery.json", import.meta.url), 0o600);
	}
	if (temp) await rm(temp, { recursive: true, force: true });
	client.destroy();
	await Bun.write(evidence, `${JSON.stringify(report, null, "\t")}\n`);
}
console.error(
	`B2 probe ${report.status}; sanitized evidence/b2-compatibility.json written`,
);
process.exitCode = report.status === "passed" ? 0 : 1;
