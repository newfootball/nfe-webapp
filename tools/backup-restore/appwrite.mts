import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { hash as bcryptHash } from "bcryptjs";
import { Account, Client, Query, TablesDB, Users } from "node-appwrite";
import { command, hash, local, privateDir, privateWrite } from "./core.mts";

export const contractSha = "86f28433ed3a6642fd9d120d17de426c92d60a96";
export async function contract(checkout: string) {
	assert.equal(
		(await command(["git", "-C", checkout, "rev-parse", "HEAD"]))
			.toString()
			.trim(),
		contractSha,
	);
	assert.equal(
		(
			await command([
				"git",
				"-C",
				checkout,
				"status",
				"--porcelain",
				"--",
				"tools/appwrite-schema",
			])
		)
			.toString()
			.trim(),
		"",
	);
	const destination = `${local}/contract`;
	await privateDir(destination);
	const files: Record<string, string> = {};
	for (const name of [
		"schema",
		"acl",
		"fixtures",
		"provision",
		"bootstrap",
		"local",
	]) {
		const content = await command([
			"git",
			"-C",
			checkout,
			"show",
			`${contractSha}:tools/appwrite-schema/${name}.mts`,
		]);
		files[`${name}.mts`] = hash(content);
		await privateWrite(`${destination}/${name}.mts`, content);
	}
	const load = (name: string) =>
		import(pathToFileURL(`${destination}/${name}.mts`).href);
	return {
		schema: await load("schema"),
		acl: await load("acl"),
		fixtures: await load("fixtures"),
		provision: (await load("provision")).provision,
		files,
	};
}
export type Credentials = {
	project: string;
	key: string;
	password: string;
	hash: string;
};
export async function bootstrap(endpoint: string): Promise<Credentials> {
	let cookie = "";
	async function request(path: string, body: object) {
		const result = await fetch(`${endpoint}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Appwrite-Project": "console",
				Origin: "http://localhost",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: JSON.stringify(body),
		});
		assert.ok(result.ok, `console_bootstrap_${result.status}`);
		const cookies = result.headers.getSetCookie();
		if (cookies.length)
			cookie = cookies.map((value) => value.split(";")[0]).join("; ");
		return result.json();
	}
	const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
	await request("/account", {
		userId: "backup-admin",
		email: "backup-admin@example.test",
		password,
		name: "Synthetic backup admin",
	});
	await request("/account/sessions/email", {
		email: "backup-admin@example.test",
		password,
	});
	await request("/teams", { teamId: "backup-team", name: "Backup proof" });
	await request("/projects", {
		projectId: "backup-proof",
		teamId: "backup-team",
		name: "Backup proof",
	});
	const key = await request("/projects/backup-proof/keys", {
		name: "Disposable proof",
		scopes: [
			"users.read",
			"users.write",
			"databases.read",
			"databases.write",
			"tables.read",
			"tables.write",
			"columns.read",
			"columns.write",
			"indexes.read",
			"indexes.write",
			"rows.read",
			"rows.write",
		],
	});
	return {
		project: "backup-proof",
		key: key.secret,
		password,
		hash: await bcryptHash(password, 10),
	};
}
export const clientFor = (endpoint: string, credentials: Credentials) =>
	new Client()
		.setEndpoint(endpoint)
		.setProject(credentials.project)
		.setKey(credentials.key);
export async function seed(
	endpoint: string,
	credentials: Credentials,
	c: Awaited<ReturnType<typeof contract>>,
	media: Record<string, string>,
) {
	const client = clientFor(endpoint, credentials);
	const db = new TablesDB(client);
	const users = new Users(client);
	await c.provision(db, "business");
	for (const [actor, userId] of Object.entries(c.fixtures.ids) as [
		string,
		string,
	][]) {
		await users.createBcryptUser({
			userId,
			email: `${userId}@example.test`,
			password: credentials.hash,
		});
		if (actor === "admin")
			await users.updateLabels({ userId, labels: ["admin"] });
	}
	for (const fixture of c.fixtures.fixtures) {
		const data = structuredClone(fixture.data);
		if (fixture.table === "media")
			Object.assign(data, {
				bucket: media.bucket,
				objectKey: media.key,
				versionId: media.versionId,
				checksum: `sha256:${media.sha256}`,
			});
		await db.createRow({
			databaseId: "business",
			tableId: fixture.table,
			rowId: fixture.id,
			data,
			permissions: c.acl.permissions(fixture.table, data, fixture.id),
		});
	}
}
export async function snapshot(
	endpoint: string,
	credentials: Credentials,
	c: Awaited<ReturnType<typeof contract>>,
) {
	const db = new TablesDB(clientFor(endpoint, credentials));
	const counts: Record<string, number> = {};
	const digests: Record<string, string> = {};
	for (const tableId of Object.keys(c.schema.tables)) {
		const result = await db.listRows({
			databaseId: "business",
			tableId,
			queries: [Query.limit(100), Query.orderAsc("$id")],
			total: true,
		});
		assert.ok(result.total < 100);
		counts[tableId] = result.total;
		digests[tableId] = hash(JSON.stringify(result.rows));
	}
	const users = await new Users(clientFor(endpoint, credentials)).list();
	assert.equal(users.total, 3);
	return { counts, digests, users: users.total };
}
async function denied(read: () => Promise<unknown>) {
	try {
		await read();
	} catch (error) {
		assert.ok([401, 404].includes((error as { code: number }).code));
		return;
	}
	throw new Error("acl_denial_missing");
}
export async function verify(
	endpoint: string,
	credentials: Credentials,
	c: Awaited<ReturnType<typeof contract>>,
) {
	const server = clientFor(endpoint, credentials);
	const actors: Record<string, TablesDB> = {
		anonymous: new TablesDB(
			new Client().setEndpoint(endpoint).setProject(credentials.project),
		),
	};
	for (const [actor, userId] of Object.entries(c.fixtures.ids) as [
		string,
		string,
	][]) {
		const client = new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project);
		const session = await new Account(client).createEmailPasswordSession({
			email: `${userId}@example.test`,
			password: credentials.password,
		});
		assert.equal(session.userId, userId, "bcrypt_password_login_failed");
		// Prove password login above; use a key-free session for ACL, never the admin API client.
		const actorSession = await new Users(server).createSession({ userId });
		client.setSession(actorSession.secret);
		assert.equal((await new Account(client).get()).$id, userId);
		actors[actor] = new TablesDB(client);
	}
	let reads = 0;
	for (const fixture of c.fixtures.fixtures) {
		// Independent oracle from the accepted business contract, not the permission builder.
		const allowed =
			fixture.table === "profiles" ||
			fixture.table === "follows" ||
			(fixture.table === "posts" && fixture.id === "post-0")
				? ["anonymous", "a", "b", "admin"]
				: ["posts", "private_profiles", "media"].includes(fixture.table)
					? ["a", "admin"]
					: ["favorites", "notifications"].includes(fixture.table)
						? ["a"]
						: fixture.table === "messages"
							? fixture.id === "message-ab"
								? ["a", "b"]
								: ["admin"]
							: ["signals", "post_private"].includes(fixture.table)
								? ["admin"]
								: [];
		for (const [actor, db] of Object.entries(actors)) {
			const ref = {
				databaseId: "business",
				tableId: fixture.table,
				rowId: fixture.id,
			};
			if (allowed.includes(actor))
				assert.equal((await db.getRow(ref)).$id, fixture.id);
			else await denied(() => db.getRow(ref));
			const list = await db.listRows({
				databaseId: "business",
				tableId: fixture.table,
				queries: [Query.equal("$id", fixture.id)],
				total: true,
			});
			assert.equal(list.total, allowed.includes(actor) ? 1 : 0);
			assert.equal(list.rows.length, allowed.includes(actor) ? 1 : 0);
			reads += 2;
		}
	}
	const db = new TablesDB(server);
	const get = (tableId: string, rowId: string) =>
		db.getRow({ databaseId: "business", tableId, rowId });
	const post = await get("posts", "post-0");
	assert.equal((await get("profiles", post.userId)).$id, c.fixtures.ids.a);
	for (const [table, id] of [
		["likes", "like-a"],
		["favorites", "favorite-a"],
		["comments", "comment-a"],
		["signals", "signal-a"],
		["media", "media-a"],
	])
		assert.equal((await get(table, id)).postId, post.$id);
	return {
		bcryptLogins: 3,
		actors: Object.keys(actors),
		aclGetAndListChecks: reads,
		linkedRecords: 6,
	};
}
