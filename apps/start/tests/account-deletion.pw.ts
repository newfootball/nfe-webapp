import { readdir, readFile, writeFile } from "node:fs/promises";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { fromCrossJSON, toJSON } from "seroval";
import { state } from "../scripts/moderation-local";

// This file is run only by the isolated account proof runner, against its own fixtures.
if (process.env.NFE_ACCOUNT_DELETION_SYNTHETIC !== "1")
	throw new Error("Dedicated account deletion proof required");
const origin = "http://127.0.0.1:3574";
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; secret: string; password: string }[];
};
const [a, b, admin] = fixture.actors;
if (!a || !b || !admin) throw new Error("A/B/admin fixtures missing");
const ids = new Map<string, string>();
for (const file of await readdir(`${import.meta.dir}/../dist/server/assets`)) {
	if (!file.endsWith(".js")) continue;
	const code = await readFile(
		`${import.meta.dir}/../dist/server/assets/${file}`,
		"utf8",
	);
	for (const name of [
		"deleteOwnAccount",
		"recoverAccountDeletion",
		"readAsset",
		"getPublicProfile",
		"signIn",
	]) {
		const start = code.indexOf(`var ${name} = createServerFn(`);
		if (start < 0) continue;
		const match = code.slice(start).match(/createSsrRpc\("([a-f0-9]+)"/);
		if (match?.[1]) ids.set(name, match[1]);
	}
}
async function call(
	request: APIRequestContext,
	name: string,
	data: unknown,
	secret?: string,
	crossOrigin = false,
	get = false,
) {
	const id = ids.get(name);
	if (!id) throw new Error(`Missing RPC ${name}`);
	const url = new URL(`${origin}/_serverFn/${id}`);
	if (get) url.searchParams.set("payload", JSON.stringify(toJSON({ data })));
	const response = await request.fetch(url.toString(), {
		method: get ? "GET" : "POST",
		headers: {
			"x-tsr-serverfn": "true",
			"content-type": "application/json",
			accept: "application/json",
			origin: crossOrigin ? "https://invalid.example" : origin,
			"sec-fetch-site": crossOrigin ? "cross-site" : "same-origin",
			...(secret
				? { cookie: `nfe-session-dev=${encodeURIComponent(secret)}` }
				: {}),
		},
		...(get ? {} : { data: JSON.stringify(toJSON({ data })) }),
	});
	if (crossOrigin) {
		expect(response.status()).toBe(403);
		return { ok: false };
	}
	expect(response.headers()["cache-control"]).toBe("private, no-store");
	const envelope = fromCrossJSON(JSON.parse(await response.text()), {}) as {
		result: { ok: boolean };
		error?: unknown;
	};
	expect(envelope.error).toBeUndefined();
	return envelope.result;
}

test("normal: anonymous, cross-origin and non-admin deletion boundaries", async ({
	request,
}) => {
	const input = {
		requestId: crypto.randomUUID(),
		confirmation: "DELETE_ALL_SENT_RECEIVED",
	};
	expect((await call(request, "deleteOwnAccount", input)).ok).toBe(false);
	expect(
		(await call(request, "deleteOwnAccount", input, a.secret, true)).ok,
	).toBe(false);
	expect(
		(
			await call(
				request,
				"deleteOwnAccount",
				{ ...input, ownerId: b.id },
				a.secret,
			)
		).ok,
	).toBe(false);
	expect(
		(
			await call(
				request,
				"recoverAccountDeletion",
				{ operationId: input.requestId },
				b.secret,
			)
		).ok,
	).toBe(false);
});

for (const [locale, title, confirm, submit] of [
	[
		"fr",
		"Supprimer mon compte",
		"Je confirme la suppression définitive de mon compte et de tous ces messages.",
		"Supprimer définitivement mon compte",
	],
	[
		"en",
		"Delete my account",
		"I confirm the permanent deletion of my account and all these messages.",
		"Permanently delete my account",
	],
] as const) {
	test(`normal: ${locale} confirmation is required`, async ({
		page,
		context,
	}) => {
		await context.addCookies([
			{
				name: "nfe-session-dev",
				value: a.secret,
				url: origin,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
		await page.goto(`/${locale}/profile/account-security`);
		await expect(page.getByRole("heading", { name: title })).toBeVisible();
		const button = page.getByRole("button", { name: submit, exact: true });
		await expect(button).toBeDisabled();
		await page.getByRole("checkbox", { name: confirm }).check();
		await expect(button).toBeEnabled();
	});
}

test("normal: real account fence and withdrawal", async ({
	request,
	page,
	context,
}) => {
	const { Client, TablesDB } = await import("node-appwrite");
	const { endpoint } = await import("../scripts/moderation-local");
	const credentials = JSON.parse(
		await readFile(`${state}/credentials.json`, "utf8"),
	) as {
		project: string;
		proofKey: string;
		accountKey: string;
		writerKey: string;
	};
	const proof = JSON.parse(
		await readFile(`${state}/account-proof.json`, "utf8"),
	) as { operationId: string; keys: string[]; assetIds: string[] };
	const client = (key: string) =>
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(key);
	const db = new TablesDB(client(credentials.proofKey));
	const writer = new TablesDB(client(credentials.accountKey));
	const databaseId = "moderation-proof";
	const ref = (tableId: string, rowId: string) => ({
		databaseId,
		tableId,
		rowId,
	});
	const business = new TablesDB(client(credentials.writerKey));
	const tx = await business.createTransaction({ ttl: 60 });
	const now = new Date().toISOString();
	await business.createRow({
		...ref("comments", "acct-held-comment"),
		transactionId: tx.$id,
		permissions: [],
		data: {
			postId: "social-public",
			userId: a.id,
			content: "Must roll back",
			createdAt: now,
			updatedAt: now,
		},
	});
	await writer.updateRow({
		...ref("account_lifecycle_anchors", a.id),
		transactionId: tx.$id,
		data: { state: "ACTIVE", updatedAt: new Date().toISOString() },
	});
	const signed = (await call(
		request,
		"readAsset",
		{ assetId: proof.assetIds[0] },
		a.secret,
		false,
		true,
	)) as { ok: boolean; value?: { url: string; expiresAt: number } };
	expect(signed.ok).toBe(true);
	if (!signed.value) throw new Error("Missing signed capability");
	expect((await fetch(signed.value.url)).status).toBe(200);
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: a.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/fr/profile/account-security");
	await page
		.getByRole("checkbox", {
			name: "Je confirme la suppression définitive de mon compte et de tous ces messages.",
		})
		.check();
	await page
		.getByRole("button", {
			name: "Supprimer définitivement mon compte",
			exact: true,
		})
		.click();
	await expect(page).toHaveURL(/\/fr\/sign-in\?notice=account-deletion/);
	const anchor = await db.getRow(ref("account_lifecycle_anchors", a.id));
	expect(typeof anchor.operationId).toBe("string");
	proof.operationId = String(anchor.operationId);
	await writeFile(`${state}/account-proof.json`, JSON.stringify(proof), {
		mode: 0o600,
	});
	await expect(
		business.updateTransaction({ transactionId: tx.$id, commit: true }),
	).rejects.toMatchObject({ code: 409 });
	await expect(
		db.getRow(ref("comments", "acct-held-comment")),
	).rejects.toMatchObject({ code: 404 });
	await expect
		.poll(
			async () =>
				(await db.getRow(ref("account_lifecycle_anchors", a.id))).state,
		)
		.not.toBe("ACTIVE");
	// Fresh public reads and asset signing must withdraw the account before cleanup.
	const publicProfile = (await call(
		request,
		"getPublicProfile",
		{ id: a.id },
		undefined,
		false,
		true,
	)) as { ok: boolean; value?: unknown };
	expect(publicProfile.ok).toBe(true);
	expect(publicProfile.value).toBeNull();
	expect(
		(
			await call(
				request,
				"readAsset",
				{ assetId: proof.assetIds[0] },
				a.secret,
				false,
				true,
			)
		).ok,
	).toBe(false);
	const delay = signed.value.expiresAt - Date.now() + 2000;
	if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
	const expired = await fetch(signed.value.url);
	expect(expired.status).toBe(401);
	expect(await expired.text()).toContain("Request has expired");
	// Once the initial request revoked the sessions, the stale credential cannot start again.
	expect(
		(
			await call(
				request,
				"deleteOwnAccount",
				{
					requestId: proof.operationId,
					confirmation: "DELETE_ALL_SENT_RECEIVED",
				},
				a.secret,
			)
		).ok,
	).toBe(false);
	expect(
		(
			await call(request, "signIn", {
				email: `${a.id}@example.test`,
				password: a.password,
			})
		).ok,
	).toBe(false);
	let staged = false;
	for (let i = 0; i < 150 && !staged; i++) {
		const op = await db.getRow(
			ref("account_lifecycle_operations", proof.operationId),
		);
		expect(op.phase).not.toBe("BLOCKED");
		if (op.phase === "ASSETS" && op.inventoryJson) {
			staged = true;
			break;
		}
		const result = await call(
			request,
			"recoverAccountDeletion",
			{ operationId: proof.operationId },
			admin.secret,
		);
		expect(result.ok).toBe(true);
	}
	expect(staged).toBe(true);
});

test("version-crash: interrupted version purge", async ({ request }) => {
	const proof = JSON.parse(
		await readFile(`${state}/account-proof.json`, "utf8"),
	) as { operationId: string };
	await expect(
		call(
			request,
			"recoverAccountDeletion",
			{ operationId: proof.operationId },
			admin.secret,
		),
	).rejects.toThrow();
});

test("auth-crash: resume after expired lease and interrupt after Auth removal", async ({
	request,
}) => {
	const { Client, TablesDB } = await import("node-appwrite");
	const { endpoint } = await import("../scripts/moderation-local");
	const credentials = JSON.parse(
		await readFile(`${state}/credentials.json`, "utf8"),
	) as { project: string; proofKey: string };
	const proof = JSON.parse(
		await readFile(`${state}/account-proof.json`, "utf8"),
	) as { operationId: string };
	const db = new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(credentials.proofKey),
	);
	const ref = {
		databaseId: "moderation-proof",
		tableId: "account_lifecycle_operations",
		rowId: proof.operationId,
	};
	const lease = await db.getRow(ref);
	const wait = Date.parse(String(lease.leaseUntil)) - Date.now() + 2000;
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	let finalizing = false;
	for (let i = 0; i < 150 && !finalizing; i++) {
		const op = await db.getRow(ref);
		expect(op.phase).not.toBe("BLOCKED");
		if (op.phase === "FINALIZE") {
			finalizing = true;
			break;
		}
		expect(
			(
				await call(
					request,
					"recoverAccountDeletion",
					{ operationId: proof.operationId },
					admin.secret,
				)
			).ok,
		).toBe(true);
	}
	expect(finalizing).toBe(true);
	await expect(
		call(
			request,
			"recoverAccountDeletion",
			{ operationId: proof.operationId },
			admin.secret,
		),
	).rejects.toThrow();
});

test("recovery: finish after Auth removal and retain foreign data", async ({
	request,
}) => {
	const { Client, TablesDB, Users, Query } = await import("node-appwrite");
	const { S3Client, ListObjectVersionsCommand, ListMultipartUploadsCommand } =
		await import("@aws-sdk/client-s3");
	const { endpoint } = await import("../scripts/moderation-local");
	const credentials = JSON.parse(
		await readFile(`${state}/credentials.json`, "utf8"),
	) as { project: string; proofKey: string };
	const proof = JSON.parse(
		await readFile(`${state}/account-proof.json`, "utf8"),
	) as { operationId: string; keys: string[]; assetIds: string[] };
	const client = (key: string) =>
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(key);
	const db = new TablesDB(client(credentials.proofKey));
	const databaseId = "moderation-proof";
	const ref = (tableId: string, rowId: string) => ({
		databaseId,
		tableId,
		rowId,
	});
	await expect(
		new Users(client(credentials.proofKey)).get({ userId: a.id }),
	).rejects.toMatchObject({ code: 404 });
	const lease = await db.getRow(
		ref("account_lifecycle_operations", proof.operationId),
	);
	const wait = Date.parse(String(lease.leaseUntil)) - Date.now() + 2000;
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	let done = false;
	for (let i = 0; i < 150 && !done; i++) {
		const result = (await call(
			request,
			"recoverAccountDeletion",
			{ operationId: proof.operationId },
			admin.secret,
		)) as { ok: boolean; value?: { phase: string; done: boolean } };
		expect(result.ok).toBe(true);
		expect(result.value?.phase).not.toBe("BLOCKED");
		done = result.value?.done === true;
	}
	expect(done).toBe(true);
	for (const [table, field] of [
		["messages", "fromUserId"],
		["messages", "toUserId"],
		["message_conversations", "participantA"],
		["message_conversations", "participantB"],
		["message_limits", "senderId"],
		["follows", "followerId"],
		["follows", "followingId"],
		["likes", "userId"],
		["favorites", "userId"],
		["comments", "userId"],
		["signals", "userId"],
		["posts", "userId"],
		["media_assets", "ownerId"],
		["notifications_v1", "actorId"],
		["notifications_v1", "recipientId"],
		["notification_outbox_v1", "actorId"],
		["notification_outbox_v1", "recipientId"],
	] as const) {
		const result = await db.listRows({
			databaseId,
			tableId: table,
			queries: [Query.equal(field, a.id), Query.limit(1)],
			total: false,
		});
		expect(result.rows).toHaveLength(0);
	}
	for (const id of ["acct-event-out", "acct-event-in"])
		await expect(
			db.getRow(ref("notification_recovery_v1", id)),
		).rejects.toMatchObject({ code: 404 });
	for (const table of ["profiles", "private_profiles"])
		await expect(db.getRow(ref(table, a.id))).rejects.toMatchObject({
			code: 404,
		});
	await expect(
		new Users(client(credentials.proofKey)).get({ userId: a.id }),
	).rejects.toMatchObject({ code: 404 });
	expect((await db.getRow(ref("messages", "acct-foreign"))).fromUserId).toBe(
		b.id,
	);
	expect(
		(await db.getRow(ref("media_assets", proof.assetIds[2]!))).ownerId,
	).toBe(b.id);
	const s3 = new S3Client({
		region: process.env.B2_REGION,
		endpoint: process.env.B2_ENDPOINT,
		credentials: {
			accessKeyId: process.env.B2_APPLICATION_KEY_ID!,
			secretAccessKey: process.env.B2_APPLICATION_KEY!,
		},
	});
	try {
		for (const key of [
			proof.keys[0]!,
			proof.keys[1]!,
			proof.keys[5]!,
			proof.keys[6]!,
		]) {
			const versions = await s3.send(
				new ListObjectVersionsCommand({
					Bucket: process.env.B2_BUCKET_NAME,
					Prefix: key,
					MaxKeys: 100,
				}),
			);
			const uploads = await s3.send(
				new ListMultipartUploadsCommand({
					Bucket: process.env.B2_BUCKET_NAME,
					Prefix: key,
					MaxUploads: 100,
				}),
			);
			expect(versions.IsTruncated).not.toBe(true);
			expect(uploads.IsTruncated).not.toBe(true);
			expect(
				[
					...(versions.Versions ?? []),
					...(versions.DeleteMarkers ?? []),
				].filter((v) => v.Key === key),
			).toHaveLength(0);
			expect((uploads.Uploads ?? []).filter((u) => u.Key === key)).toHaveLength(
				0,
			);
		}
		const foreign = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: process.env.B2_BUCKET_NAME,
				Prefix: proof.keys[2],
				MaxKeys: 100,
			}),
		);
		expect(
			(foreign.Versions ?? []).filter((v) => v.Key === proof.keys[2]).length,
		).toBe(2);
	} finally {
		s3.destroy();
	}
});

test("normal: mounted own deletion blocks on ambiguous allocation", async ({
	page,
	context,
	request,
}) => {
	const blocked = fixture.actors[3];
	if (!blocked) throw new Error("Blocked actor missing");
	const { Client, TablesDB } = await import("node-appwrite");
	const { endpoint } = await import("../scripts/moderation-local");
	const credentials = JSON.parse(
		await readFile(`${state}/credentials.json`, "utf8"),
	) as { project: string; proofKey: string };
	const db = new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(credentials.proofKey),
	);
	await context.addCookies([
		{
			name: "nfe-session-dev",
			value: blocked.secret,
			url: origin,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.goto("/fr/profile/account-security");
	await page
		.getByRole("checkbox", {
			name: "Je confirme la suppression définitive de mon compte et de tous ces messages.",
		})
		.check();
	await page
		.getByRole("button", {
			name: "Supprimer définitivement mon compte",
			exact: true,
		})
		.click();
	await expect(page).toHaveURL(/\/fr\/sign-in/);
	const anchor = await db.getRow({
		databaseId: "moderation-proof",
		tableId: "account_lifecycle_anchors",
		rowId: blocked.id,
	});
	let blockedPhase = false;
	for (let i = 0; i < 150 && !blockedPhase; i++) {
		const result = (await call(
			request,
			"recoverAccountDeletion",
			{ operationId: anchor.operationId },
			admin.secret,
		)) as { ok: boolean; value?: { phase: string; done: boolean } };
		expect(result.ok).toBe(true);
		expect(result.value?.done).toBe(false);
		blockedPhase = result.value?.phase === "BLOCKED";
	}
	expect(blockedPhase).toBe(true);
});

test("normal: foreign shared reference blocks purge and retains exact versions", async ({
	request,
}) => {
	const shared = fixture.actors[4];
	if (!shared) throw new Error("Shared owner fixture missing");
	const { Client, TablesDB } = await import("node-appwrite");
	const { S3Client, ListObjectVersionsCommand } = await import(
		"@aws-sdk/client-s3"
	);
	const { endpoint } = await import("../scripts/moderation-local");
	const credentials = JSON.parse(
		await readFile(`${state}/credentials.json`, "utf8"),
	) as { project: string; proofKey: string };
	const proof = JSON.parse(
		await readFile(`${state}/account-proof.json`, "utf8"),
	) as { keys: string[]; assetIds: string[] };
	const db = new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(credentials.proofKey),
	);
	const profileRef = {
		databaseId: "moderation-proof",
		tableId: "profiles",
		rowId: b.id,
	};
	const s3 = new S3Client({
		region: process.env.B2_REGION,
		endpoint: process.env.B2_ENDPOINT,
		credentials: {
			accessKeyId: process.env.B2_APPLICATION_KEY_ID!,
			secretAccessKey: process.env.B2_APPLICATION_KEY!,
		},
	});
	await db.updateRow({
		...profileRef,
		data: { image: `/media/${proof.assetIds[4]}` },
	});
	try {
		const operationId = crypto.randomUUID();
		const [first, replay] = await Promise.all([
			call(
				request,
				"deleteOwnAccount",
				{ requestId: operationId, confirmation: "DELETE_ALL_SENT_RECEIVED" },
				shared.secret,
			),
			call(
				request,
				"deleteOwnAccount",
				{ requestId: operationId, confirmation: "DELETE_ALL_SENT_RECEIVED" },
				shared.secret,
			),
		]);
		expect(first.ok).toBe(true);
		expect(replay.ok).toBe(true);
		let blocked = false;
		for (let i = 0; i < 150 && !blocked; i++) {
			const result = (await call(
				request,
				"recoverAccountDeletion",
				{ operationId },
				admin.secret,
			)) as { ok: boolean; value?: { phase: string; done: boolean } };
			expect(result.ok).toBe(true);
			expect(result.value?.done).toBe(false);
			blocked = result.value?.phase === "BLOCKED";
		}
		expect(blocked).toBe(true);
		const listed = await s3.send(
			new ListObjectVersionsCommand({
				Bucket: process.env.B2_BUCKET_NAME,
				Prefix: proof.keys[4],
				MaxKeys: 100,
			}),
		);
		expect(listed.IsTruncated).not.toBe(true);
		expect(
			(listed.Versions ?? []).filter((v) => v.Key === proof.keys[4]).length,
		).toBe(2);
	} finally {
		await db.updateRow({ ...profileRef, data: { image: null } });
		s3.destroy();
	}
});
