import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIResponse, expect, test } from "@playwright/test";
import {
	Client,
	Permission,
	Query,
	Role,
	TablesDB,
	Users,
} from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/moderation-local";
import type { AdminPage, ReportDTO } from "../src/lib/moderation-contract";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseId = "moderation-proof",
	origin = "http://127.0.0.1:3574",
	postId = "social-public";
if (process.env.START_APPWRITE_DATABASE !== databaseId)
	throw new Error("Dedicated synthetic moderation database required");
const c = JSON.parse(await readFile(`${state}/credentials.json`, "utf8")) as {
	project: string;
	proofKey: string;
	readerKey: string;
	writerKey: string;
	sessionKey: string;
};
const fixture = JSON.parse(await readFile(`${state}/fixture.json`, "utf8")) as {
	actors: { id: string; secret: string; password: string }[];
};
const [a, b, admin] = fixture.actors;
if (!a || !b || !admin) throw new Error("A/B/admin fixtures missing");
const base = () => new Client().setEndpoint(endpoint).setProject(c.project);
const db = new TablesDB(base().setKey(c.proofKey));
const secrets = [
	c.proofKey,
	c.readerKey,
	c.writerKey,
	c.sessionKey,
	...fixture.actors.flatMap((v) => [v.secret, v.password]),
	"CONFIDENTIAL-MODERATION-PROFILE",
];
const rpcIds: Record<string, string> = {};
for (const file of await readdir(`${root}/dist/server/assets`)) {
	if (!/^(moderation|media)-/.test(file)) continue;
	const text = await readFile(`${root}/dist/server/assets/${file}`, "utf8");
	for (const m of text.matchAll(
		/var (\w+) = createServerFn\([\s\S]*?createSsrRpc\("([a-f0-9]+)"\)/g,
	))
		if (m[1] && m[2]) rpcIds[m[1]] = m[2];
}
function rpc(name: string) {
	const id = rpcIds[name];
	if (!id) throw new Error(`Built RPC missing: ${name}`);
	return `${origin}/_serverFn/${id}`;
}
const headers = (secret: string, extra: Record<string, string> = {}) => ({
	"x-tsr-serverfn": "true",
	"content-type": "application/json",
	Accept: "application/json",
	Origin: origin,
	"sec-fetch-site": "same-origin",
	Cookie: secret ? `nfe-session-dev=${secret}` : "",
	...extra,
});
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function result<T>(response: APIResponse): Promise<Result<T>> {
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toBe("private, no-store");
	const raw = await response.text();
	for (const secret of secrets) expect(raw.includes(secret)).toBe(false);
	const decoded = fromCrossJSON(JSON.parse(raw), {}) as {
		result: Result<T>;
		error?: unknown;
	};
	expect(decoded.error).toBeUndefined();
	return decoded.result;
}
const post = (id = postId) =>
	db.getRow({ databaseId, tableId: "posts", rowId: id });
const signals = () =>
	db.listRows({
		databaseId,
		tableId: "signals",
		queries: [Query.limit(100)],
		total: true,
	});
async function decision(
	s: ReportDTO,
	operation: "review" | "dismiss" | "reject",
) {
	const p = await post(s.postId);
	return {
		signalId: s.id,
		postId: s.postId,
		signalVersion: s.version,
		postVersion: p.$updatedAt,
		operation,
	};
}
test("isolated moderation: SSR/RPC guards, spoof, unique reports, thresholds, bounded pages, atomic conflict/rollback, media denial and FR/EN account switch", async ({
	page,
	context,
	request,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const call = async <T>(
		name: string,
		data: unknown,
		secret = admin.secret,
		extra: Record<string, string> = {},
	) =>
		result<T>(
			await request.post(rpc(name), {
				headers: headers(secret, extra),
				data: JSON.stringify(toJSON({ data })),
			}),
		);
	const get = async <T>(name: string, data: unknown, secret = admin.secret) => {
		const url = new URL(rpc(name));
		url.searchParams.set("payload", JSON.stringify(toJSON({ data })));
		return result<T>(await request.get(url.href, { headers: headers(secret) }));
	};
	const list = async (
		status = "PENDING",
		q = "",
		cursor: string | null = null,
		kind = "reports",
	) => {
		const r = await get<AdminPage>("getAdminPage", { kind, q, status, cursor });
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error("Admin page failed");
		return r.value;
	};
	const cookie = async (secret: string) => {
		await context.clearCookies();
		if (secret)
			await context.addCookies([
				{
					name: "nfe-session-dev",
					value: secret,
					url: origin,
					httpOnly: true,
					sameSite: "Lax",
				},
			]);
	};
	// Bounded synthetic cleanup only, never outside this dedicated database.
	const previous = await signals();
	expect(previous.total).toBeLessThan(100);
	for (const s of previous.rows)
		await db.deleteRow({ databaseId, tableId: "signals", rowId: s.$id });
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});
	const before = await post();
	for (const secret of ["", a.secret, b.secret]) {
		expect((await get("getModerationDashboard", undefined, secret)).ok).toBe(
			false,
		);
		expect((await get("getAdminPage", { kind: "users" }, secret)).ok).toBe(
			false,
		);
		await cookie(secret);
		const response = await page.goto("/fr/admin");
		expect(response?.headers()["cache-control"]).toBe("private, no-store");
		await expect(page.getByRole("alert")).toHaveText(
			"Accès réservé aux administrateurs",
		);
	}
	await db.updateRow({
		databaseId,
		tableId: "private_profiles",
		rowId: a.id,
		data: { role: "ADMIN" },
	});
	expect((await get("getModerationDashboard", undefined, a.secret)).ok).toBe(
		false,
	);
	await db.updateRow({
		databaseId,
		tableId: "private_profiles",
		rowId: a.id,
		data: { role: "USER" },
	});
	const report = { postId, reason: "SPAM", details: "Synthetic detail" };
	expect(
		(await call("reportPost", { ...report, role: "admin" }, a.secret)).ok,
	).toBe(false);
	expect((await call("reportPost", report, "")).ok).toBe(false);
	expect(
		(
			await call("reportPost", report, a.secret, {
				Origin: "https://evil.example",
				"sec-fetch-site": "cross-site",
			})
		).ok,
	).toBe(false);
	for (const id of ["social-draft", "social-private", "social-orphan"])
		expect(
			(await call("reportPost", { ...report, postId: id }, a.secret)).ok,
		).toBe(false);
	await cookie(a.secret);
	await page.goto(`/en/post/${postId}`);
	await page.getByText("Report this post", { exact: true }).click();
	await page.getByLabel("Reason", { exact: true }).selectOption("SPAM");
	await page.getByLabel("Details (optional)").fill("Synthetic detail");
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Report recorded" }),
	).toBeVisible();
	const duplicate = await Promise.all([
		call<{ created: boolean }>("reportPost", report, a.secret),
		call<{ created: boolean }>("reportPost", report, a.secret),
	]);
	for (const r of duplicate) {
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.created).toBe(false);
	}
	expect((await signals()).total).toBe(1);
	const s = (await list()).reports[0];
	if (!s) throw new Error("Report missing");
	for (const secret of [a.secret, b.secret, ""])
		expect(
			(await call("moderateReport", await decision(s, "reject"), secret)).ok,
		).toBe(false);
	for (const secret of [a.secret, b.secret, ""]) {
		const direct = new TablesDB(secret ? base().setSession(secret) : base());
		await expect(
			direct.getRow({ databaseId, tableId: "signals", rowId: s.id }),
		).rejects.toBeDefined();
		await expect(
			direct.updateRow({
				databaseId,
				tableId: "signals",
				rowId: s.id,
				data: { status: "REVIEWED" },
			}),
		).rejects.toBeDefined();
		await expect(
			direct.getRow({ databaseId, tableId: "post_private", rowId: postId }),
		).rejects.toBeDefined();
	}
	expect(
		(
			await call("moderateReport", {
				...(await decision(s, "reject")),
				postId: "social-second",
			})
		).ok,
	).toBe(false);
	expect(
		(
			await call("moderateReport", {
				...(await decision(s, "reject")),
				operation: "erase",
			})
		).ok,
	).toBe(false);
	// Existing sessions must lose admin privileges immediately when Auth labels change.
	const users = new Users(base().setKey(c.proofKey));
	await users.updateLabels({ userId: admin.id, labels: [] });
	expect(
		(await get("getModerationDashboard", undefined, admin.secret)).ok,
	).toBe(false);
	expect(
		(await get("getAdminPage", { kind: "reports" }, admin.secret)).ok,
	).toBe(false);
	expect(
		(await call("moderateReport", await decision(s, "reject"), admin.secret))
			.ok,
	).toBe(false);
	await users.updateLabels({ userId: admin.id, labels: ["admin"] });
	expect(
		(await get("getModerationDashboard", undefined, admin.secret)).ok,
	).toBe(true);
	// Real staged transaction rollback and conflict, controlled solely in test proxy.
	const control = process.env.NFE_MODERATION_PROXY_CONTROL,
		token = process.env.NFE_MODERATION_PROXY_TOKEN;
	if (!control || !token) throw new Error("Proxy control required");
	const proxy = (method: string, data?: unknown) =>
		request.fetch(control, {
			method,
			headers: { "x-proof-token": token },
			data,
		});
	await proxy("POST", { postId, phase: "commit", when: "fail" });
	expect((await call("moderateReport", await decision(s, "reject"))).ok).toBe(
		false,
	);
	expect(((await (await proxy("GET")).json()) as { hit: boolean }).hit).toBe(
		true,
	);
	expect((await post()).status).toBe("PUBLISHED");
	expect((await post()).$permissions).toEqual(before.$permissions);
	expect(
		(await db.getRow({ databaseId, tableId: "signals", rowId: s.id })).status,
	).toBe("PENDING");
	await proxy("DELETE");
	await proxy("POST", { postId, phase: "commit", when: "before" });
	const pending = call("moderateReport", await decision(s, "reject"));
	await expect
		.poll(
			async () => ((await (await proxy("GET")).json()) as { hit: boolean }).hit,
		)
		.toBe(true);
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "ARCHIVED" },
		permissions: [Permission.read(Role.user(b.id))],
	});
	await proxy("DELETE");
	expect((await pending).ok).toBe(false);
	expect((await post()).status).toBe("ARCHIVED");
	expect(
		(await db.getRow({ databaseId, tableId: "signals", rowId: s.id })).status,
	).toBe("PENDING");
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});
	// Pause BEFORE staging the anchor, so this explicitly covers stale-before-stage.
	await proxy("POST", { postId, phase: "anchor", when: "before" });
	const beforeStage = call("moderateReport", await decision(s, "reject"));
	await expect
		.poll(
			async () => ((await (await proxy("GET")).json()) as { hit: boolean }).hit,
		)
		.toBe(true);
	const archivedACL = [
		Permission.read(Role.user(b.id)),
		Permission.read(Role.label("admin")),
	];
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "ARCHIVED" },
		permissions: archivedACL,
	});
	await proxy("DELETE");
	expect((await beforeStage).ok).toBe(false);
	expect((await post()).status).toBe("ARCHIVED");
	expect((await post()).$permissions.sort()).toEqual([...archivedACL].sort());
	expect(
		(await db.getRow({ databaseId, tableId: "signals", rowId: s.id })).status,
	).toBe("PENDING");
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});
	// A signal changes after its first read but before its staged update.
	await proxy("POST", { postId, phase: "signal", when: "before" });
	const signalRace = call("moderateReport", await decision(s, "reject"));
	await expect
		.poll(
			async () => ((await (await proxy("GET")).json()) as { hit: boolean }).hit,
		)
		.toBe(true);
	const concurrent = await db.updateRow({
		databaseId,
		tableId: "signals",
		rowId: s.id,
		data: { details: "Concurrent revision" },
	});
	expect(concurrent.$updatedAt).not.toBe(s.version);
	await proxy("DELETE");
	expect((await signalRace).ok).toBe(false);
	const retained = await db.getRow({
		databaseId,
		tableId: "signals",
		rowId: s.id,
	});
	expect(retained.details).toBe("Concurrent revision");
	expect(retained.status).toBe("PENDING");
	expect((await post()).status).toBe("PUBLISHED");
	expect((await post()).$permissions).toEqual(before.$permissions);
	// The now-stale signal token remains syntactically valid but cannot authorize a decision.
	expect((await call("moderateReport", await decision(s, "reject"))).ok).toBe(
		false,
	);
	await db.updateRow({
		databaseId,
		tableId: "signals",
		rowId: s.id,
		data: { details: "Synthetic detail" },
	});
	// Thresholds count all unique reports, retaining accepted legacy semantics.
	const now = "2026-10-30T11:00:00.000Z";
	for (let i = 0; i < 8; i++)
		await db.createRow({
			databaseId,
			tableId: "signals",
			rowId: `threshold-${i}`,
			data: {
				postId,
				userId: `seed-${i}`,
				reason: "SPAM",
				details: null,
				status: "PENDING",
				createdAt: now,
				updatedAt: now,
			},
			permissions: [Permission.read(Role.label("admin"))],
		});
	expect((await call("reportPost", report, b.secret)).ok).toBe(true);
	expect(
		(await db.getRow({ databaseId, tableId: "post_private", rowId: postId }))
			.spamScore,
	).toBe("SPAM");
	for (const secret of ["", a.secret, b.secret])
		await expect(
			new TablesDB(secret ? base().setSession(secret) : base()).getRow({
				databaseId,
				tableId: "post_private",
				rowId: postId,
			}),
		).rejects.toBeDefined();
	await expect(
		new TablesDB(base().setSession(admin.secret)).getRow({
			databaseId,
			tableId: "signals",
			rowId: s.id,
		}),
	).resolves.toBeDefined();
	// Simultaneous first-time duplicate requests hit the real unique index/parent anchor.
	const simultaneous = await Promise.all([
		call("reportPost", { ...report, postId: "social-second" }, a.secret),
		call("reportPost", { ...report, postId: "social-second" }, a.secret),
	]);
	expect(simultaneous.some((r) => r.ok)).toBe(true);
	const uniqueRows = await db.listRows({
		databaseId,
		tableId: "signals",
		queries: [Query.equal("postId", "social-second"), Query.limit(100)],
	});
	expect(uniqueRows.total).toBe(1);
	for (const r of uniqueRows.rows)
		await db.deleteRow({ databaseId, tableId: "signals", rowId: r.$id });
	for (let i = 0; i < 4; i++)
		await db.createRow({
			databaseId,
			tableId: "signals",
			rowId: `suspect-${i}`,
			data: {
				postId: "social-second",
				userId: `suspect-user-${i}`,
				reason: "SPAM",
				details: null,
				status: "PENDING",
				createdAt: now,
				updatedAt: now,
			},
			permissions: [Permission.read(Role.label("admin"))],
		});
	expect(
		(await call("reportPost", { ...report, postId: "social-second" }, a.secret))
			.ok,
	).toBe(true);
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "post_private",
				rowId: "social-second",
			})
		).spamScore,
	).toBe("SUSPECT");
	const suspectRows = await db.listRows({
		databaseId,
		tableId: "signals",
		queries: [Query.equal("postId", "social-second"), Query.limit(100)],
	});
	for (const r of suspectRows.rows)
		await db.deleteRow({ databaseId, tableId: "signals", rowId: r.$id });
	// Bounded users and report pagination with prefix and exact-post search.
	for (let i = 0; i < 15; i++)
		await db.createRow({
			databaseId,
			tableId: "signals",
			rowId: `page-${i}`,
			data: {
				postId: "social-second",
				userId: `page-user-${i}`,
				reason: "OTHER",
				details: null,
				status: "PENDING",
				createdAt: now,
				updatedAt: now,
			},
			permissions: [Permission.read(Role.label("admin"))],
		});
	const first = await list();
	expect(first.reports).toHaveLength(20);
	expect(first.nextCursor).not.toBeNull();
	const second = await list("PENDING", "", first.nextCursor);
	expect(second.reports).toHaveLength(5);
	expect(
		new Set([...first.reports, ...second.reports].map((r) => r.id)).size,
	).toBe(25);
	expect((await list("PENDING", postId)).reports).toHaveLength(10);
	const people = await list("PENDING", "", null, "users");
	expect(people.users).toHaveLength(20);
	expect(
		(await list("PENDING", "public moderation-a", null, "users")).users.map(
			(u) => u.id,
		),
	).toEqual([a.id]);
	for (const operation of ["review", "dismiss"] as const) {
		const r = (await list()).reports.find((r) => r.postId === "social-second");
		if (!r) throw new Error("Decision fixture missing");
		expect(
			(await call("moderateReport", await decision(r, operation))).ok,
		).toBe(true);
		expect(
			(await db.getRow({ databaseId, tableId: "signals", rowId: r.id })).status,
		).toBe(operation === "review" ? "REVIEWED" : "DISMISSED");
	}
	const fresh = (await list("PENDING", postId)).reports.find(
		(r) => r.id === s.id,
	);
	if (!fresh) throw new Error("Original signal missing");
	const assetId = crypto.randomUUID();
	await db.createRow({
		databaseId,
		tableId: "media_assets",
		rowId: assetId,
		permissions: [Permission.read(Role.user(b.id))],
		data: {
			ownerId: b.id,
			kind: "video",
			state: "ATTACHED",
			provider: "B2",
			bucket: "synthetic",
			objectKey: `moderation-proof/${assetId}`,
			versionId: "synthetic",
			byteSize: 1,
			sha256: "a".repeat(64),
			mimetype: "video/mp4",
			postId,
			createdAt: now,
			updatedAt: now,
		},
	});
	// Synthetic signer exercises the real owner fallback; no B2 object is used.
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "ARCHIVED" },
		permissions: [
			Permission.read(Role.user(b.id)),
			Permission.read(Role.label("admin")),
		],
	});
	const preview = await get<{ url: string }>(
		"readAsset",
		{ assetId },
		b.secret,
	);
	expect(preview.ok).toBe(true);
	if (preview.ok)
		expect(preview.value.url).toBe(
			"https://signing.invalid/synthetic-capability",
		);
	for (const secret of ["", a.secret, admin.secret])
		expect((await get("readAsset", { assetId }, secret)).ok).toBe(false);
	await db.updateRow({
		databaseId,
		tableId: "posts",
		rowId: postId,
		data: { status: "PUBLISHED" },
		permissions: [Permission.read(Role.any())],
	});
	await proxy("POST", { postId, phase: "signature", when: "before" });
	const signingRace = get("readAsset", { assetId }, b.secret);
	await expect
		.poll(
			async () => ((await (await proxy("GET")).json()) as { hit: boolean }).hit,
		)
		.toBe(true);
	await cookie(admin.secret);
	await page.goto("/fr/admin");
	await expect(
		page.getByRole("heading", { name: "Administration", exact: true }),
	).toBeVisible();
	const card = page.locator("article").filter({ hasText: "Synthetic detail" });
	await card
		.getByRole("button", { name: "Retirer la publication", exact: true })
		.click();
	await expect(card).toHaveCount(0);
	await proxy("DELETE");
	expect(await signingRace).toEqual({ ok: false, error: "forbidden" });
	const rejected = await post();
	expect(rejected.status).toBe("REJECTED");
	expect(rejected.$permissions).not.toContain(Permission.read(Role.any()));
	for (const field of [
		"slug",
		"createdAt",
		"updatedAt",
		"publishedAt",
		"validatedAt",
		"expiresAt",
		"title",
		"description",
	])
		expect(rejected[field]).toEqual(before[field]);
	expect(
		(await db.getRow({ databaseId, tableId: "signals", rowId: s.id })).status,
	).toBe("REVIEWED");
	await expect(
		new TablesDB(base()).getRow({
			databaseId,
			tableId: "posts",
			rowId: postId,
		}),
	).rejects.toBeDefined();
	for (const secret of ["", a.secret, b.secret, admin.secret]) {
		const r = await get("readAsset", { assetId }, secret);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("forbidden");
	}
	expect(
		(await request.get(`${origin}/post-media/${postId}/video`)).status(),
	).toBe(404);
	await page.goto(`/en/post/${postId}`);
	await expect(
		page.getByRole("heading", { name: before.title as string, exact: true }),
	).toHaveCount(0);
	await page.goto("/en/admin");
	await expect(
		page.getByRole("link", { name: "Reports", exact: true }),
	).toBeVisible();
	// Existing account transition clears Query and invalidates Router; no prior admin data survives.
	await page.goto("/en/private");
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page.goto("/en/admin");
	await expect(page.getByRole("alert")).toHaveText("Administrators only");
	expect(await page.locator("article").count()).toBe(0);
	await cookie(b.secret);
	await page.goto("/fr/admin");
	await expect(page.getByRole("alert")).toHaveText(
		"Accès réservé aux administrateurs",
	);
	expect(await page.locator("article").count()).toBe(0);
	expect(errors).toEqual([]);
});
