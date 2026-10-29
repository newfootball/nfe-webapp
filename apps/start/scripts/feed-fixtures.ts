import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./feed-bootstrap";
import { databaseId } from "./feed-capabilities";
import { endpoint, state } from "./feed-local";
export const timestamp = "2026-01-15T12:34:56.123Z";
export async function fixtureSetup() {
	const c = await bootstrap(),
		admin = new Client()
			.setEndpoint(endpoint)
			.setProject(c.project)
			.setKey(c.proofKey),
		db = new TablesDB(admin),
		users = new Users(admin);
	const dir = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provisionProfileV2 } = await import(`${dir}/profile-v2.mts`);
	await provisionProfileV2(db, databaseId);
	const file = Bun.file(`${state}/fixture.json`);
	if (await file.exists()) return await file.json();
	// Fresh project owned by this proof only; finite known probe rows, never source data.
	for (let i = 0; i < 41; i++)
		await db.deleteRow({
			databaseId,
			tableId: "posts",
			rowId: `probe-${String(i).padStart(3, "0")}`,
		});
	for (let i = 0; i < 35; i++)
		await db.deleteRow({ databaseId, tableId: "likes", rowId: `like-${i}` });
	const actors = [];
	for (const [i, type] of [
		"USER",
		"PLAYER",
		"COACH",
		"RECRUITER",
		"CLUB",
	].entries()) {
		const id = `feed-actor-${i}`,
			password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
		await users.create({
			userId: id,
			email: `${id}@example.test`,
			password,
			name: `Private Auth ${i}`,
		});
		if (i === 4) await users.updateLabels({ userId: id, labels: ["admin"] });
		const session = await users.createSession({ userId: id });
		actors.push({ id, secret: session.secret, password, type });
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			data: {
				name: i === 0 ? "Équipe Alpha" : `Person ${i}`,
				nameFolded: i === 0 ? "équipe alpha" : `person ${i}`,
				image: null,
				biography: null,
				position: [],
				foot: [],
				localisation: "Paris",
				userType: type,
				isOnboarded: true,
				createdAt: timestamp,
				updatedAt: null,
			},
			permissions: [Permission.read(Role.any())],
		});
		await db.createRow({
			databaseId,
			tableId: "private_profiles",
			rowId: id,
			data: {
				role: i === 4 ? "ADMIN" : "USER",
				birthday: "2000-01-01T00:00:00.000Z",
				fullName: "PRIVATE-FULL-NAME",
			},
			permissions: [
				Permission.read(Role.user(id)),
				Permission.read(Role.label("admin")),
			],
		});
	}
	// Enough suggestions for first batches to be entirely followed for actor A.
	for (let i = 0; i < 45; i++)
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: `suggestion-${String(i).padStart(3, "0")}`,
			data: {
				name: `Suggestion ${i}`,
				nameFolded: `suggestion ${i}`,
				image: null,
				biography: null,
				position: [],
				foot: [],
				localisation: null,
				userType: "USER",
				isOnboarded: true,
				createdAt: timestamp,
				updatedAt: null,
			},
			permissions: [Permission.read(Role.any())],
		});
	await db.createRow({
		databaseId,
		tableId: "profiles",
		rowId: "hidden-profile",
		data: {
			name: "Hidden Profile",
			nameFolded: "hidden profile",
			image: null,
			biography: null,
			position: [],
			foot: [],
			localisation: null,
			userType: "USER",
			isOnboarded: false,
			createdAt: timestamp,
			updatedAt: null,
		},
		permissions: [
			Permission.read(Role.user(actors[0]!.id)),
			Permission.read(Role.label("admin")),
		],
	});
	for (let i = 0; i < 32; i++)
		await db.createRow({
			databaseId,
			tableId: "follows",
			rowId: `follow-${i}`,
			data: {
				followerId: actors[0]!.id,
				followingId: `suggestion-${String(44 - i).padStart(3, "0")}`,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
			permissions: [Permission.read(Role.any())],
		});
	const statuses = ["DRAFT", "PENDING", "REJECTED", "ARCHIVED", null];
	const ids = [];
	for (let i = 0; i < 45; i++) {
		const id = `feed-post-${String(i).padStart(3, "0")}`,
			status = i < 40 ? "PUBLISHED" : statuses[i - 40],
			owner = actors[i % 5]!.id;
		const data = {
			slug: id,
			userId: owner,
			title: i === 2 ? "L’équipe d’Ouest" : `Équipe Paris ${i}`,
			titleFolded: i === 2 ? "l’équipe d’ouest" : `équipe paris ${i}`,
			description: i % 2 ? "Une démonstration unique" : "Paris et football",
			descriptionFolded:
				i % 2 ? "une démonstration unique" : "paris et football",
			type: null,
			status,
			createdAt: timestamp,
			updatedAt: timestamp,
			publishedAt: i === 39 ? null : timestamp,
			expiresAt: null,
			validatedAt: null,
		};
		await db.createRow({
			databaseId,
			tableId: "posts",
			rowId: id,
			data,
			permissions:
				status === "PUBLISHED"
					? [Permission.read(Role.any())]
					: [
							Permission.read(Role.user(owner)),
							Permission.read(Role.label("admin")),
						],
		});
		await db.createRow({
			databaseId,
			tableId: "post_private",
			rowId: id,
			data: { spamScore: "SPAM" },
			permissions: [Permission.read(Role.label("admin"))],
		});
		await db.createRow({
			databaseId,
			tableId: "media",
			rowId: `media-${i}`,
			data: {
				postId: id,
				type: "mainVideo",
				mimetype: "video/mp4",
				provider: "B2",
				bucket: "private-fixture-bucket",
				objectKey: `PRIVATE-OBJECT-KEY/${id}`,
				byteSize: 1024,
				checksum: "synthetic",
				ownerId: owner,
				state: "READY",
				createdAt: timestamp,
				updatedAt: timestamp,
			},
			permissions: [
				Permission.read(Role.user(owner)),
				Permission.read(Role.label("admin")),
			],
		});
		if (status === "PUBLISHED") ids.push(id);
	}
	for (let i = 0; i < 150; i++)
		await db.createRow({
			databaseId,
			tableId: "likes",
			rowId: `fixture-like-${i}`,
			data: {
				userId: `synthetic-${i}`,
				postId: i < 131 ? "feed-post-039" : "feed-post-038",
				createdAt: timestamp,
				updatedAt: timestamp,
			},
			permissions: [],
		});
	for (let i = 0; i < 121; i++)
		await db.createRow({
			databaseId,
			tableId: "comments",
			rowId: `fixture-comment-${i}`,
			data: {
				userId: `synthetic-${i}`,
				postId: i < 101 ? "feed-post-039" : "feed-post-040",
				content: "PRIVATE-COMMENT-TEXT",
				createdAt: timestamp,
				updatedAt: timestamp,
			},
			permissions: [],
		});
	const fixture = { actors, ids };
	await Bun.write(file, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	return fixture;
}
if (import.meta.main) {
	await fixtureSetup();
	console.log("Synthetic feed fixtures ready");
}
