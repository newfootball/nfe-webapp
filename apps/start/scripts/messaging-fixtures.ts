import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./messaging-bootstrap";
import { endpoint, state } from "./messaging-local";
export const databaseId = "messaging-proof";
export const timestamp = "1998-07-12T12:34:56.123Z";
export type FixtureActor = {
	id: string;
	email: string;
	password: string;
	secret: string;
	secondarySecret: string;
};
export type Fixture = { actors: FixtureActor[]; ids: string[] };
export async function fixtures(): Promise<Fixture> {
	const c = await bootstrap();
	const admin = new Client()
			.setEndpoint(endpoint)
			.setProject(c.project)
			.setKey(c.proofKey),
		db = new TablesDB(admin),
		users = new Users(admin);
	const dir = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${dir}/provision.mts`),
		{ provisionProfileV2 } = await import(`${dir}/profile-v2.mts`),
		{ provisionNotificationV1 } = await import(`${dir}/notification-v1.mts`),
		{ provisionMessaging, indexImportedConversations } = await import(
			`${dir}/messaging.mts`
		),
		{ permissions } = await import(`${dir}/acl.mts`);
	const saved = Bun.file(`${state}/fixture.json`);
	if (await saved.exists()) {
		await provisionMessaging(db, databaseId);
		await provisionNotificationV1(db, databaseId);
		return await saved.json();
	}
	await provision(db, databaseId);
	await provisionProfileV2(db, databaseId);
	await provisionMessaging(db, databaseId);
	await provisionMessaging(db, databaseId);
	await provisionNotificationV1(db, databaseId);
	const actors: FixtureActor[] = [];
	for (const id of [
		"actor-A",
		"actor-B",
		"actor-C",
		"actor-admin",
		"actor-incomplete",
	]) {
		const password = `Synthetic-${crypto.randomUUID()}-Aa1!`,
			email = `${id}@example.test`;
		await users.create({ userId: id, email, password, name: id });
		if (id === "actor-admin")
			await users.updateLabels({ userId: id, labels: ["admin"] });
		const session = await users.createSession({ userId: id });
		const secondary = await users.createSession({ userId: id });
		actors.push({
			id,
			email,
			password,
			secret: session.secret,
			secondarySecret: secondary.secret,
		});
		const data = {
			name: id,
			nameFolded: id.toLowerCase(),
			image: null,
			biography: null,
			localisation: null,
			userType: "USER",
			position: [],
			foot: [],
			isOnboarded: id !== "actor-incomplete",
			createdAt: timestamp,
			updatedAt: null,
		};
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			data,
			permissions: permissions("profiles", data, id),
		});
		await db.createRow({
			databaseId,
			tableId: "private_profiles",
			rowId: id,
			data: { role: id === "actor-admin" ? "ADMIN" : "USER" },
			permissions: permissions("private_profiles", {}, id),
		});
	}
	// B-C has no prior conversation; a one-way follow explicitly permits opening.
	const follow = {
		followerId: "actor-B",
		followingId: "actor-C",
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	await db.createRow({
		databaseId,
		tableId: "follows",
		rowId: "imported.follow",
		data: follow,
		permissions: permissions("follows", follow, ""),
	});
	const ids: string[] = [];
	for (let i = 0; i < 45; i++) {
		const id = `imported.message-${String(i).padStart(2, "0")}`;
		ids.push(id);
		const data = {
			fromUserId: i % 2 ? "actor-A" : "actor-B",
			toUserId: i % 2 ? "actor-B" : "actor-A",
			content: `Imported history ${i}`,
			readAt: null,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		await db.createRow({
			databaseId,
			tableId: "messages",
			rowId: id,
			data,
			permissions: permissions("messages", data, id),
		});
	}
	const quotaFollow = {
		followerId: "actor-C",
		followingId: "actor-admin",
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	await db.createRow({
		databaseId,
		tableId: "follows",
		rowId: "quota.follow",
		data: quotaFollow,
		permissions: permissions("follows", quotaFollow, ""),
	});
	// >one page of conversations, with equal business dates and stable synthetic IDs.
	for (let i = 0; i < 23; i++) {
		const id = `peer-${i}`;
		await users.create({
			userId: id,
			email: `${id}@example.test`,
			password: `Synthetic-${crypto.randomUUID()}-Aa1!`,
			name: id,
		});
		const profile = {
			name: id,
			nameFolded: id,
			image: null,
			biography: null,
			localisation: null,
			userType: "USER",
			position: [],
			foot: [],
			isOnboarded: true,
			createdAt: timestamp,
			updatedAt: null,
		};
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			data: profile,
			permissions: permissions("profiles", profile, id),
		});
		const data = {
			fromUserId: id,
			toUserId: "actor-A",
			content: `Other conversation ${i}`,
			readAt: null,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		await db.createRow({
			databaseId,
			tableId: "messages",
			rowId: `other.message-${i}`,
			data,
			permissions: permissions("messages", data, ""),
		});
	}
	await indexImportedConversations(db, databaseId);
	const fixture = { actors, ids };
	await Bun.write(`${state}/fixture.json`, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	return fixture;
}
