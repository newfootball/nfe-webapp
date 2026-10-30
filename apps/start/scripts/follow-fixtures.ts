import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./follow-bootstrap";
import { endpoint, state } from "./follow-local";

export const databaseId = "follow-proof";
export async function fixtures() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const directory = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${directory}/provision.mts`);
	const { provisionProfileV2 } = await import(`${directory}/profile-v2.mts`);
	await provision(db, databaseId);
	await provisionProfileV2(db, databaseId);
	const file = `${state}/fixture.json`;
	if (await Bun.file(file).exists())
		return { c, fixture: await Bun.file(file).json() };
	const users = new Users(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const actors = [];
	const timestamp = "2026-10-30T10:00:00.000Z";
	for (const id of ["follow-a", "follow-b", "follow-admin"]) {
		const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
		await users.create({
			userId: id,
			email: `${id}@example.test`,
			password,
			name: `Private Auth ${id}`,
		});
		if (id === "follow-admin")
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
			data: { role: "USER", fullName: "CONFIDENTIAL-FOLLOW-PROFILE" },
			permissions: [Permission.read(Role.user(actor.id))],
		});
	for (let i = 0; i < 22; i++)
		await db.createRow({
			databaseId,
			tableId: "follows",
			rowId: `imported-edge-${String(i).padStart(2, "0")}`,
			data: {
				followerId: "follow-a",
				followingId: `person-${String(i).padStart(2, "0")}`,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
			permissions: [Permission.read(Role.any())],
		});
	const fixture = { actors };
	await Bun.write(file, JSON.stringify(fixture));
	await chmod(file, 0o600);
	return { c, fixture };
}
