import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./interactions-bootstrap";
import { endpoint, state } from "./interactions-local";

export const databaseId = "interactions-proof";
export async function fixtures() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const directory = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${directory}/provision.mts`);
	const { provisionProfileV2 } = await import(`${directory}/profile-v2.mts`);
	// v1 intentionally rejects unknown columns; an already-applied additive v2
	// must use its own replay validator, as in the accepted profile proof.
	try {
		await db.getRow({
			databaseId,
			tableId: "schema_versions",
			rowId: "v2-club-profile",
		});
	} catch (error) {
		if ((error as { code?: number }).code !== 404) throw error;
		await provision(db, databaseId);
	}
	await provisionProfileV2(db, databaseId);
	const file = `${state}/fixture.json`;
	if (await Bun.file(file).exists()) {
		const fixture = (await Bun.file(file).json()) as {
			actors: { id: string; password: string; secret: string }[];
		};
		const users = new Users(
			new Client()
				.setEndpoint(endpoint)
				.setProject(c.project)
				.setKey(c.proofKey),
		);
		for (const actor of fixture.actors)
			actor.secret = (await users.createSession({ userId: actor.id })).secret;
		await Bun.write(file, JSON.stringify(fixture));
		await chmod(file, 0o600);
		return { c, fixture };
	}
	const users = new Users(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const actors = [];
	const timestamp = "2026-10-30T10:00:00.000Z";
	for (const id of ["interactions-a", "interactions-b", "interactions-admin"]) {
		const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
		await users.create({
			userId: id,
			email: `${id}@example.test`,
			password,
			name: `Private Auth ${id}`,
		});
		if (id === "interactions-admin")
			await users.updateLabels({ userId: id, labels: ["admin"] });
		const session = await users.createSession({ userId: id });
		actors.push({ id, password, secret: session.secret });
	}
	for (const id of [
		...actors.map((a) => a.id),
		...Array.from(
			{ length: 22 },
			(_, i) => `person-${String(i).padStart(2, "0")}`,
		),
		"hidden-profile",
	]) {
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			data: {
				name: `Public ${id}`,
				nameFolded: `public ${id}`,
				image: null,
				biography: null,
				localisation: "Paris",
				position: [],
				foot: [],
				userType: "USER",
				isOnboarded: id !== "hidden-profile",
				createdAt: timestamp,
				updatedAt: null,
			},
			permissions:
				id === "hidden-profile"
					? [Permission.read(Role.label("admin"))]
					: [Permission.read(Role.any())],
		});
	}
	for (const actor of actors)
		await db.createRow({
			databaseId,
			tableId: "private_profiles",
			rowId: actor.id,
			data: { role: "USER", fullName: "CONFIDENTIAL-INTERACTIONS-PROFILE" },
			permissions: [Permission.read(Role.user(actor.id))],
		});
	for (const [id, status, owner, publicRead] of [
		["social-public", "PUBLISHED", "interactions-b", true],
		["social-second", "PUBLISHED", "interactions-a", true],
		["social-draft", "DRAFT", "interactions-a", false],
		["social-archived", "ARCHIVED", "interactions-a", false],
		["social-private", "PUBLISHED", "interactions-a", false],
		["social-orphan", "PUBLISHED", "missing-author", true],
	] as const)
		await db.createRow({
			databaseId,
			tableId: "posts",
			rowId: id,
			data: {
				userId: owner,
				slug: `legacy-${id}`,
				title: `Public ${id}`,
				titleFolded: `public ${id}`,
				description: "Synthetic post",
				descriptionFolded: "synthetic post",
				status,
				type: null,
				createdAt: timestamp,
				updatedAt: timestamp,
				publishedAt: timestamp,
				validatedAt: null,
				expiresAt: null,
			},
			permissions: publicRead
				? [Permission.read(Role.any())]
				: [
						Permission.read(Role.user(owner)),
						Permission.read(Role.label("admin")),
					],
		});
	const fixture = { actors };
	await Bun.write(file, JSON.stringify(fixture));
	await chmod(file, 0o600);
	return { c, fixture };
}
