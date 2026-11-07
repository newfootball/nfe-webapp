import assert from "node:assert/strict";

export type B2 = {
	api: string;
	download: string;
	token: string;
	account: string;
};
export type Version = {
	fileId: string;
	fileName: string;
	action: string;
	contentLength: number;
	contentSha1: string;
	uploadTimestamp: number;
};

async function retry(run: () => Promise<Response>) {
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await run();
			if (res.status < 500 && res.status !== 429) return res;
			if (attempt >= 5) return res;
		} catch (error) {
			if (attempt >= 5) throw error;
		}
		await Bun.sleep(500 * 2 ** attempt);
	}
}

async function call<T>(b2: B2, op: string, body: unknown): Promise<T> {
	const res = await retry(() =>
		fetch(`${b2.api}/b2api/v2/${op}`, {
			method: "POST",
			headers: { Authorization: b2.token, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
	assert.equal(res.ok, true, `b2_${op}_${res.status}`);
	return (await res.json()) as T;
}

export async function authorize(id: string, key: string): Promise<B2> {
	assert.ok(id && key, "b2_credentials_missing");
	const res = await fetch(
		"https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
		{
			headers: { Authorization: `Basic ${btoa(`${id}:${key}`)}` },
		},
	);
	assert.equal(res.ok, true, `b2_authorize_${res.status}`);
	const a = (await res.json()) as {
		apiUrl: string;
		downloadUrl: string;
		authorizationToken: string;
		accountId: string;
	};
	return {
		api: a.apiUrl,
		download: a.downloadUrl,
		token: a.authorizationToken,
		account: a.accountId,
	};
}

export async function bucketId(b2: B2, name: string) {
	const r = await call<{ buckets: { bucketId: string }[] }>(
		b2,
		"b2_list_buckets",
		{
			accountId: b2.account,
			bucketName: name,
		},
	);
	assert.equal(r.buckets.length, 1, "b2_bucket_not_found");
	return r.buckets[0].bucketId;
}

export async function versions(b2: B2, bucket: string, prefix = "") {
	const all: Version[] = [];
	let next: { startFileName?: string; startFileId?: string } = {};
	for (;;) {
		const r = await call<{
			files: Version[];
			nextFileName: string | null;
			nextFileId: string | null;
		}>(b2, "b2_list_file_versions", {
			bucketId: bucket,
			prefix,
			maxFileCount: 10000,
			...next,
		});
		all.push(...r.files);
		if (!r.nextFileName) return all;
		next = {
			startFileName: r.nextFileName,
			startFileId: r.nextFileId ?? undefined,
		};
	}
}

export async function copy(
	b2: B2,
	sourceFileId: string,
	destinationBucketId: string,
	fileName: string,
) {
	return call<Version>(b2, "b2_copy_file", {
		sourceFileId,
		destinationBucketId,
		fileName,
		metadataDirective: "COPY",
	});
}

export async function upload(
	b2: B2,
	bucket: string,
	fileName: string,
	data: Uint8Array,
) {
	const target = await call<{ uploadUrl: string; authorizationToken: string }>(
		b2,
		"b2_get_upload_url",
		{
			bucketId: bucket,
		},
	);
	const res = await fetch(target.uploadUrl, {
		method: "POST",
		headers: {
			Authorization: target.authorizationToken,
			"X-Bz-File-Name": encodeURIComponent(fileName),
			"Content-Type": "application/octet-stream",
			"X-Bz-Content-Sha1": new Bun.CryptoHasher("sha1")
				.update(data)
				.digest("hex"),
		},
		body: new Blob([new Uint8Array(data)]),
	});
	assert.equal(res.ok, true, `b2_upload_${res.status}`);
	return (await res.json()) as Version;
}

export async function downloadById(b2: B2, fileId: string) {
	const res = await fetch(
		`${b2.download}/b2api/v2/b2_download_file_by_id?fileId=${fileId}`,
		{
			headers: { Authorization: b2.token },
		},
	);
	assert.equal(res.ok, true, `b2_download_${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

export async function pool<T, R>(
	items: T[],
	size: number,
	run: (item: T) => Promise<R>,
) {
	const out: R[] = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: size }, async () => {
			while (i < items.length) {
				const n = i++;
				out[n] = await run(items[n]);
			}
		}),
	);
	return out;
}
