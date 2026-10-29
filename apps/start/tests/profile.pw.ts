import { chmod, readFile, writeFile } from "node:fs/promises";
import {
	type APIResponse,
	type Request as BrowserRequest,
	expect,
	type Page,
	test,
} from "@playwright/test";
import { Account, Client, type Models, TablesDB, Users } from "node-appwrite";
import { fromCrossJSON, toJSON } from "seroval";
import { endpoint, state } from "../scripts/profile-local";

const databaseId = process.env.START_APPWRITE_DATABASE;
if (!databaseId) throw new Error("Isolated profile database required");

import { permissions } from "../../../tools/appwrite-schema/acl.mts";

const origin = "http://127.0.0.1:3513";
const config = JSON.parse(
	await readFile(`${state}/credentials.json`, "utf8"),
) as {
	project: string;
	proofKey: string;
	sessionKey: string;
	writerKey: string;
};
const base = () =>
	new Client().setEndpoint(endpoint).setProject(config.project);
const admin = base().setKey(config.proofKey);
const users = new Users(admin);
const db = new TablesDB(admin);
const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
const secrets = [
	password,
	config.proofKey,
	config.sessionKey,
	config.writerKey,
];
function noLeaks(value: string) {
	expect(secrets.some((v) => value.includes(v))).toBe(false);
}
async function remember(secret: string) {
	secrets.push(secret);
	await writeFile(
		`${state}/fixture.json`,
		JSON.stringify(Object.fromEntries(secrets.map((v, i) => [`s${i}`, v]))),
	);
	await chmod(`${state}/fixture.json`, 0o600);
}
const headers = (cookie = "", extra: Record<string, string> = {}) => ({
	"x-tsr-serverfn": "true",
	"content-type": "application/json",
	Accept: "application/json",
	Origin: origin,
	"sec-fetch-site": "same-origin",
	Cookie: cookie,
	...extra,
});
async function result(r: Pick<APIResponse, "status" | "headers" | "text">) {
	expect(r.status()).toBe(200);
	expect(r.headers()["cache-control"]).toBe("private, no-store");
	const text = await r.text();
	noLeaks(text);
	const envelope = fromCrossJSON(JSON.parse(text), {}) as {
		result: unknown;
		error?: unknown;
	};
	expect(envelope.error).toBeUndefined();
	return envelope.result;
}
const body = (data: unknown) => JSON.stringify(toJSON({ data }));
const postCall = (page: Page) =>
	page.waitForRequest(
		(r) => r.url().includes("/_serverFn/") && r.method() === "POST",
	);
async function denied(run: () => Promise<unknown>) {
	let code = 0;
	try {
		await run();
	} catch (e) {
		code = (e as { code: number }).code;
	}
	expect([401, 403, 404]).toContain(code);
}
async function signup(page: Page, type: string, locale = "en") {
	await page.goto(`/${locale}/sign-in`);
	await page
		.getByRole("button", {
			name: locale === "en" ? "Sign up" : "Inscription",
			exact: true,
		})
		.click();
	await page
		.getByLabel(locale === "en" ? "Name" : "Nom", { exact: true })
		.fill(`Private Auth ${type}`);
	await page
		.getByLabel(locale === "en" ? "Email address" : "Adresse e-mail")
		.fill(
			`profile-${type.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@example.test`,
		);
	await page
		.getByLabel(locale === "en" ? "Password" : "Mot de passe", { exact: true })
		.fill(password);
	await page
		.getByRole("button", {
			name: locale === "en" ? "Sign up" : "Inscription",
			exact: true,
		})
		.first()
		.click();
	await expect(page.getByTestId("identity")).toBeVisible();
}

test("five account types: real signup, atomic onboarding/edit, public redaction and reload", async ({
	page,
	context,
	browser,
	request,
}) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (e) => browserErrors.push(e.message));
	let initCall: BrowserRequest | undefined;
	let onboardingCall: BrowserRequest | undefined;
	let editCall: BrowserRequest | undefined;
	let ownCall: BrowserRequest | undefined;
	const actors: {
		id: string;
		cookie: string;
		name: string;
		secret: string;
		data: Record<string, unknown>;
	}[] = [];
	for (const type of ["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"]) {
		await context.clearCookies();
		await signup(page, type);
		const cookie = (await context.cookies()).find(
			(c) => c.name === "nfe-session-dev",
		);
		if (!cookie) throw new Error("Missing synthetic session");
		await remember(cookie.value);
		const sessionClient = base().setSession(cookie.value);
		const account = new Account(sessionClient);
		const user = await account.get();
		const cookieHeader = `${cookie.name}=${cookie.value}`;
		const read = page.waitForRequest(
			(r) => r.url().includes("/_serverFn/") && r.method() === "GET",
		);
		await page.getByRole("link", { name: "My profile", exact: true }).click();
		ownCall = await read;
		await expect(page).toHaveURL(/\/en\/onboarding$/);
		const init = postCall(page);
		await page.getByRole("button", { name: "Start", exact: true }).click();
		initCall = await init;
		await expect(
			page.getByRole("button", { name: "Continue", exact: true }),
		).toBeVisible();
		const replay = (
			url: string,
			data: unknown,
			cookie = cookieHeader,
			extra: Record<string, string> = {},
		) =>
			request.post(url, { headers: headers(cookie, extra), data: body(data) });
		// Concurrent idempotent initialization has no import-overwriting upsert.
		const initResults = await Promise.all(
			Array.from({ length: 8 }, () => replay(initCall!.url(), {}).then(result)),
		);
		expect(
			initResults.every(
				(v) => JSON.stringify(v) === '{"ok":true,"value":{"initialized":true}}',
			),
		).toBe(true);
		const draft = await db.getRow({
			databaseId,
			tableId: "profiles",
			rowId: user.$id,
		});
		expect(draft.isOnboarded).toBe(false);
		expect(draft.name).toBeNull();
		const guestDb = new TablesDB(base());
		const bSession = await users.create({
			userId: `observer-${crypto.randomUUID().slice(0, 8)}`,
			email: `observer-${crypto.randomUUID()}@example.test`,
			password,
		});
		const observer = await users.createSession({ userId: bSession.$id });
		await remember(observer.secret);
		const bDb = new TablesDB(base().setSession(observer.secret));
		for (const actor of [guestDb, bDb])
			await denied(() =>
				actor.getRow({ databaseId, tableId: "profiles", rowId: user.$id }),
			);
		await page
			.getByRole("combobox", { name: "Account type", exact: true })
			.selectOption(type);
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		const name = `Public ${type} ${user.$id}`;
		await page.getByLabel("Unique public name").fill(name);
		await page.getByLabel("City", { exact: true }).fill("Paris");
		await page
			.getByRole("textbox", { name: "Biography", exact: true })
			.fill(`Biography ${type}`);
		if (type !== "USER" && type !== "CLUB")
			await page
				.getByLabel("Date of birth", { exact: true })
				.fill("2001-03-04");
		if (type === "PLAYER") {
			await page.getByLabel("Striker", { exact: true }).check();
			await page.getByLabel("Left winger", { exact: true }).check();
			await page
				.getByRole("combobox", { name: "Preferred foot", exact: true })
				.selectOption("BOTH");
			await page
				.getByLabel("License", { exact: true })
				.fill("private-license-player");
		}
		if (["COACH", "RECRUITER", "CLUB"].includes(type))
			await page
				.getByLabel("Club name", { exact: true })
				.fill(`Private club ${type}`);
		if (type === "CLUB") {
			await page.getByLabel("Club size", { exact: true }).fill("25");
			await page
				.getByLabel("Club position", { exact: true })
				.fill("Private director");
		}
		const complete = postCall(page);
		await page.getByRole("button", { name: "Finish", exact: true }).click();
		onboardingCall = await complete;
		await expect(page.getByTestId("profile-name")).toHaveText(name);
		const publicRow = await guestDb.getRow({
			databaseId,
			tableId: "profiles",
			rowId: user.$id,
		});
		expect(publicRow.userType).toBe(type);
		expect(publicRow.createdAt).toBe(draft.createdAt);
		const privateRow = await db.getRow({
			databaseId,
			tableId: "private_profiles",
			rowId: user.$id,
		});
		expect(privateRow.role).toBe("USER");
		expect(privateRow.$id).toBe(publicRow.$id);
		if (type === "PLAYER") {
			expect(publicRow.position).toEqual(["LEFT_WINGER", "STRIKER"]);
			expect(publicRow.foot).toEqual(["LEFT", "RIGHT"]);
		}
		if (type === "CLUB") {
			expect(privateRow.clubSize).toBe(25);
			expect(privateRow.clubPosition).toBe("Private director");
			expect(privateRow.birthday).toBeNull();
		}
		await denied(() =>
			guestDb.getRow({
				databaseId,
				tableId: "private_profiles",
				rowId: user.$id,
			}),
		);
		await denied(() =>
			bDb.getRow({ databaseId, tableId: "private_profiles", rowId: user.$id }),
		);
		await denied(() =>
			new TablesDB(sessionClient).updateRow<Models.DefaultRow>({
				databaseId,
				tableId: "profiles",
				rowId: user.$id,
				data: { name: "Stolen" },
			}),
		);
		const publicResponse = await request.get(`/en/user/${user.$id}`);
		expect(publicResponse.status()).toBe(200);
		const html = await publicResponse.text();
		for (const secret of [
			user.email,
			user.name,
			"private-license-player",
			"Private club",
			"Private director",
			"2001-03-04",
		])
			expect(html.includes(secret)).toBe(false);
		noLeaks(html);
		await page
			.getByRole("link", { name: "Edit my profile", exact: true })
			.click();
		await expect(page.getByLabel("Email address")).toHaveAttribute(
			"readonly",
			"",
		);
		const editName = `Edited ${type} ${user.$id}`;
		await page.getByLabel("Unique public name").fill(editName);
		await page
			.getByRole("textbox", { name: "Biography", exact: true })
			.fill("Updated biography");
		await page
			.getByLabel("Private full name / club")
			.fill(`Private edited ${type}`);
		const edit = postCall(page);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		editCall = await edit;
		await expect(page.getByTestId("profile-name")).toHaveText(editName);
		await page.reload();
		await expect(page.getByTestId("profile-name")).toHaveText(editName);
		await page
			.getByRole("link", { name: "Public profile", exact: true })
			.click();
		await expect(page.getByTestId("profile-name")).toHaveText(editName);
		expect((await page.content()).includes("Private edited")).toBe(false);
		await page.goto(`/en/profile/edit-user`);
		await expect(page.getByLabel("Unique public name")).toHaveValue(editName);
		const editData = {
			name: editName,
			biography: "Updated biography",
			localisation: "Paris",
			fullName: `Private edited ${type}`,
			birthday: type === "USER" || type === "CLUB" ? null : "2001-03-04",
			position: publicRow.position,
			foot: publicRow.foot,
			license: privateRow.license,
			clubSize: privateRow.clubSize,
			clubPosition: privateRow.clubPosition,
		};
		actors.push({
			id: user.$id,
			cookie: cookieHeader,
			secret: cookie.value,
			name: editName,
			data: editData,
		});
		// Strict direct RPC: no IDs, role, labels, prefs, email, ACL or unknown fields.
		for (const data of [
			null,
			undefined,
			[],
			{},
			{ ...editData, userId: bSession.$id },
			...[
				"id",
				"role",
				"labels",
				"prefs",
				"email",
				"$permissions",
				"isOnboarded",
				"userType",
			].map((key) => ({ ...editData, [key]: "ADMIN" })),
		])
			expect(await result(await replay(editCall.url(), data))).toEqual({
				ok: false,
				error: "invalid",
			});
		for (const badOrigin of ["https://evil.test", "null", ""])
			expect(
				await result(
					await replay(editCall.url(), editData, cookieHeader, {
						Origin: badOrigin,
					}),
				),
			).toEqual({ ok: false, error: "origin" });
		expect(await result(await replay(editCall.url(), editData, ""))).toEqual({
			ok: false,
			error: "unauthorized",
		});
		expect(
			(
				await db.getRow({
					databaseId,
					tableId: "private_profiles",
					rowId: user.$id,
				})
			).role,
		).toBe("USER");
		await users.delete({ userId: bSession.$id });
	}
	if (!initCall || !onboardingCall || !editCall || !ownCall)
		throw new Error("Missing RPC witnesses");
	const a = actors[0];
	const b = actors[1];
	if (!a || !b) throw new Error("Missing actors");
	const mutate = (data: unknown, cookie = a.cookie) =>
		request
			.post(editCall!.url(), { headers: headers(cookie), data: body(data) })
			.then(result);

	// Fresh concurrent initialization and failed publication are exercised through real RPCs.
	const freshId = `fresh-${crypto.randomUUID().slice(0, 8)}`;
	await users.create({
		userId: freshId,
		email: `${freshId}@example.test`,
		password,
	});
	const freshSession = await users.createSession({ userId: freshId });
	await remember(freshSession.secret);
	const freshCookie = `nfe-session-dev=${freshSession.secret}`;
	const freshInit = await Promise.all(
		Array.from({ length: 8 }, () =>
			request
				.post(initCall.url(), { headers: headers(freshCookie), data: body({}) })
				.then(result),
		),
	);
	expect(freshInit.every((v) => (v as { ok: boolean }).ok)).toBe(true);
	expect(
		(await db.getRow({ databaseId, tableId: "profiles", rowId: freshId }))
			.isOnboarded,
	).toBe(false);
	const freshData = {
		name: b.name,
		city: "Lyon",
		biography: "Fresh",
		userType: "PLAYER",
		birthDate: "2002-01-02",
		position: ["STRIKER"],
		foot: "BOTH",
		license: "private-rollback-license",
	};
	const submitFresh = (data: unknown) =>
		request
			.post(onboardingCall.url(), {
				headers: headers(freshCookie),
				data: body(data),
			})
			.then(result);
	for (const invalid of [
		null,
		{},
		{ ...freshData, userType: "ADMIN" },
		{ ...freshData, role: "ADMIN" },
		{ ...freshData, id: b.id },
		{ ...freshData, position: ["invalid"] },
		{ ...freshData, birthDate: "2999-01-01" },
	])
		expect(await submitFresh(invalid)).toEqual({ ok: false, error: "invalid" });
	expect(await submitFresh(freshData)).toEqual({
		ok: false,
		error: "conflict",
	});
	const failedProfile = await db.getRow({
		databaseId,
		tableId: "profiles",
		rowId: freshId,
	});
	const failedPrivate = await db.getRow({
		databaseId,
		tableId: "private_profiles",
		rowId: freshId,
	});
	expect(failedProfile.name).toBeNull();
	expect(failedProfile.isOnboarded).toBe(false);
	expect(failedPrivate.birthday).toBeNull();
	expect(failedPrivate.license).toBeNull();
	await denied(() =>
		new TablesDB(base()).getRow({
			databaseId,
			tableId: "profiles",
			rowId: freshId,
		}),
	);
	expect((await request.get(`/en/user/${freshId}`)).status()).toBe(404);
	expect(await submitFresh({ ...freshData, name: `Fresh ${freshId}` })).toEqual(
		{ ok: true, value: { updated: true } },
	);
	expect(
		await submitFresh({ ...freshData, name: "Retry must not overwrite" }),
	).toEqual({ ok: false, error: "forbidden" });
	const crossSite = await request.post(editCall.url(), {
		headers: headers(a.cookie, { "sec-fetch-site": "cross-site" }),
		data: body(a.data),
	});
	expect(crossSite.status()).toBe(403);
	// Name collision must roll back both rows, including private details and public ACLs.
	const before = await db.getRow({
		databaseId,
		tableId: "private_profiles",
		rowId: a.id,
	});
	expect(
		await mutate({ ...a.data, name: b.name, fullName: "Must roll back" }),
	).toEqual({ ok: false, error: "conflict" });
	expect(
		(await db.getRow({ databaseId, tableId: "private_profiles", rowId: a.id }))
			.fullName,
	).toBe(before.fullName);
	expect(
		(await db.getRow({ databaseId, tableId: "profiles", rowId: a.id })).name,
	).toBe(a.name);
	// Prefs never authorize admin; only privileged labels do. Admin still cannot target B.
	await users.updatePrefs({
		userId: a.id,
		prefs: { role: "admin", labels: ["admin"], nfeLocale: "en" },
	});
	const current = new Account(base().setSession(a.secret));
	expect((await current.get()).labels).toEqual([]);
	await users.updateLabels({ userId: a.id, labels: ["admin"] });
	const adminDb = new TablesDB(base().setSession(a.secret));
	expect(
		(
			await adminDb.getRow({
				databaseId,
				tableId: "private_profiles",
				rowId: b.id,
			})
		).$id,
	).toBe(b.id);
	expect(await mutate({ ...a.data, id: b.id })).toEqual({
		ok: false,
		error: "invalid",
	});
	await denied(() =>
		adminDb.updateRow<Models.DefaultRow>({
			databaseId,
			tableId: "private_profiles",
			rowId: b.id,
			data: { role: "ADMIN" },
		}),
	);
	await users.updateLabels({ userId: a.id, labels: [] });
	await denied(() =>
		adminDb.getRow({ databaseId, tableId: "private_profiles", rowId: b.id }),
	);
	// Concurrent SSR uses the same loader with independent sessions and no public caching.
	const responses = await Promise.all(
		Array.from({ length: 8 }, (_, i) =>
			request
				.get("/en/profile/edit-user", {
					headers: { Cookie: i % 2 ? a.cookie : b.cookie },
				})
				.then(async (r) => ({ r, text: await r.text(), i })),
		),
	);
	for (const { r, text, i } of responses) {
		expect(r.status()).toBe(200);
		expect(r.headers()["cache-control"]).toContain("no-store");
		expect(text.includes(i % 2 ? a.id : b.id)).toBe(true);
		expect(text.includes(i % 2 ? b.id : a.id)).toBe(false);
		noLeaks(text);
	}
	// Two complete updates may conflict, but must never mix public/private halves.
	const concurrent = await Promise.all(
		["Race one", "Race two"].map((v) =>
			mutate({ ...a.data, name: v, fullName: v }),
		),
	);
	expect(concurrent.some((v) => (v as { ok: boolean }).ok)).toBe(true);
	const finalP = await db.getRow({
		databaseId,
		tableId: "profiles",
		rowId: a.id,
	});
	const finalD = await db.getRow({
		databaseId,
		tableId: "private_profiles",
		rowId: a.id,
	});
	expect(finalP.name).toBe(finalD.fullName);
	// Idempotent initialization preserves imported dates/nulls/role and never republishes.
	const importedId = `import-${crypto.randomUUID().slice(0, 8)}`;
	await users.create({
		userId: importedId,
		email: `${importedId}@example.test`,
		password,
	});
	const importedSession = await users.createSession({ userId: importedId });
	await remember(importedSession.secret);
	const importedData = {
		name: "Imported unique",
		nameFolded: "imported unique",
		image: null,
		biography: null,
		position: ["STRIKER"],
		foot: ["RIGHT"],
		localisation: null,
		userType: "PLAYER",
		isOnboarded: true,
		createdAt: "2020-01-02T03:04:05.123Z",
		updatedAt: null,
	};
	for (const [tableId, data] of [
		["profiles", importedData],
		[
			"private_profiles",
			{ role: "ADMIN", fullName: "Private imported", birthday: null },
		],
	] as const)
		await db.createRow({
			databaseId,
			tableId,
			rowId: importedId,
			data,
			permissions: permissions(tableId, data, importedId),
		});
	const importedBefore = await db.getRow({
		databaseId,
		tableId: "profiles",
		rowId: importedId,
	});
	expect(
		await result(
			await request.post(initCall.url(), {
				headers: headers(`nfe-session-dev=${importedSession.secret}`),
				data: body({}),
			}),
		),
	).toEqual({ ok: true, value: { initialized: true } });
	expect(
		await db.getRow({ databaseId, tableId: "profiles", rowId: importedId }),
	).toEqual(importedBefore);
	expect(
		(
			await db.getRow({
				databaseId,
				tableId: "private_profiles",
				rowId: importedId,
			})
		).role,
	).toBe("ADMIN");
	expect(
		(await new Account(base().setSession(importedSession.secret)).get()).labels,
	).toEqual([]);
	// Server API keys are distinct least-scope credentials.
	await denied(() => new Users(base().setKey(config.writerKey)).list());
	await denied(() =>
		new TablesDB(base().setKey(config.writerKey)).getRow({
			databaseId,
			tableId: "private_profiles",
			rowId: a.id,
		}),
	);
	await denied(() =>
		new TablesDB(base().setKey(config.sessionKey)).updateRow<Models.DefaultRow>(
			{ databaseId, tableId: "profiles", rowId: a.id, data: { name: "No" } },
		),
	);
	// Invalidated identities are refused by direct mutations, without UI gating.
	await users.updateStatus({ userId: a.id, status: false });
	expect(await mutate(a.data)).toEqual({ ok: false, error: "unauthorized" });
	await users.updateStatus({ userId: a.id, status: true });
	await users.deleteSessions({ userId: a.id });
	expect(await mutate(a.data)).toEqual({ ok: false, error: "unauthorized" });
	// Locale aliases: cookie > stored preference > weighted header > French fallback; URL wins.
	for (const [path, expected, extra] of [
		[
			"/profile",
			"/en/profile",
			{ Cookie: b.cookie + "; NEXT_LOCALE=en", "Accept-Language": "fr" },
		],
		[
			"/onboarding",
			"/fr/onboarding",
			{ "Accept-Language": "de,fr;q=0.8,en;q=0.4" },
		],
		[
			`/user/${b.id}`,
			`/en/user/${b.id}`,
			{ "Accept-Language": "en-GB,en;q=0.9" },
		],
		[
			"/profile/edit-user",
			"/fr/profile/edit-user",
			{ Cookie: "NEXT_LOCALE=invalid", "Accept-Language": "de" },
		],
	] as const) {
		const response = await request.get(path, {
			headers: { ...extra },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(307);
		expect(response.headers().location).toBe(expected);
	}
	const other = await browser.newContext();
	await other.addCookies([
		{ name: "nfe-session-dev", value: b.secret, url: origin },
		{ name: "NEXT_LOCALE", value: "en", url: origin },
	]);
	const french = await other.newPage();
	await french.goto("/fr/profile/edit-user");
	await expect(
		french.getByRole("heading", { name: "Modifier mon profil" }),
	).toBeVisible();
	await french
		.getByRole("combobox", { name: "Langue préférée", exact: true })
		.selectOption("fr");
	await french
		.getByRole("button", { name: "Enregistrer", exact: true })
		.click();
	await expect(french.getByTestId("profile-name")).toBeVisible();
	expect(
		(await new Account(base().setSession(b.secret)).get()).prefs.nfeLocale,
	).toBe("fr");
	expect(
		(await other.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value,
	).toBe("fr");
	await other.close();
	const v1Before = await db.getRow({
		databaseId,
		tableId: "schema_versions",
		rowId: "v1",
	});
	expect(
		await db.getRow({ databaseId, tableId: "schema_versions", rowId: "v1" }),
	).toEqual(v1Before);
	expect(browserErrors).toEqual([]);
});
