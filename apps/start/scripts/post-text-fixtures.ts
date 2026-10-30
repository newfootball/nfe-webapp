import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./post-text-bootstrap";
import { endpoint, state } from "./post-text-local";
export const databaseId = "post-text-proof";
export const timestamp = "2026-01-15T12:34:56.123Z";
export async function fixtures() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const users = new Users(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const dir = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${dir}/provision.mts`);
	const { provisionProfileV2 } = await import(`${dir}/profile-v2.mts`);
	const { permissions } = await import(`${dir}/acl.mts`);
	const { schemaDigest } = await import(`${dir}/schema.mts`);
	let applied: Record<string, unknown> | null = null;
	try {
		applied = await db.getRow({
			databaseId,
			tableId: "schema_versions",
			rowId: "v1",
		});
	} catch (e) {
		if ((e as { code: number }).code !== 404) throw e;
	}
	if (!applied) await provision(db, databaseId);
	else if (applied.digest !== schemaDigest)
		throw new Error("Owned fixture schema drift");
	await provisionProfileV2(db, databaseId);
	const saved = Bun.file(`${state}/fixture.json`);
	if (await saved.exists()) return await saved.json();

	async function ensureRow(v: {
		databaseId: string;
		tableId: string;
		rowId: string;
		data: Record<string, unknown>;
		permissions: string[];
	}) {
		try {
			return await db.createRow(v);
		} catch (e) {
			if ((e as { code: number }).code !== 409) throw e;
			return await db.getRow({
				databaseId: v.databaseId,
				tableId: v.tableId,
				rowId: v.rowId,
			});
		}
	}

	const actors = [];
	for (const id of ["owner-A", "owner-B", "owner-admin"]) {
		const password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
		try {
			await users.create({
				userId: id,
				email: `${id}@example.test`,
				password,
				name: id,
			});
		} catch (e) {
			if ((e as { code: number }).code !== 409) throw e;
			await users.updatePassword({ userId: id, password });
		}
		if (id === "owner-admin")
			await users.updateLabels({ userId: id, labels: ["admin"] });
		const session = await users.createSession({ userId: id });
		actors.push({
			id,
			email: `${id}@example.test`,
			password,
			secret: session.secret,
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
			isOnboarded: true,
			createdAt: timestamp,
			updatedAt: null,
		};
		await ensureRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			data,
			permissions: permissions("profiles", data, id),
		});
		await ensureRow({
			databaseId,
			tableId: "private_profiles",
			rowId: id,
			data: { role: id === "owner-admin" ? "ADMIN" : "USER" },
			permissions: permissions("private_profiles", {}, id),
		});
	}
	const ids = [];
	for (let i = 0; i < 25; i++) {
		const id = `text.legacy-${String(i).padStart(2, "0")}`,
			userId = i === 24 ? "owner-B" : "owner-A";
		const status = [
			"DRAFT",
			"PUBLISHED",
			"PENDING",
			"REJECTED",
			"ARCHIVED",
			null,
		][i % 6];
		const data = {
			userId,
			slug: `stable-slug-${i}`,
			title: `Original ${i}`,
			titleFolded: `original ${i}`,
			description: `Description ${i}`,
			descriptionFolded: `description ${i}`,
			type: null,
			status,
			createdAt: timestamp,
			updatedAt: timestamp,
			publishedAt: null,
			expiresAt: null,
			validatedAt: null,
		};
		await ensureRow({
			databaseId,
			tableId: "posts",
			rowId: id,
			data,
			permissions: permissions("posts", data, id),
		});
		const media = {
			type: "mainVideo",
			postId: id,
			mimetype: "video/mp4",
			filename: null,
			label: null,
			metadataJson: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			provider: "B2",
			bucket: "SYNTHETIC-PRIVATE",
			objectKey: `SYNTHETIC-KEY-${i}`,
			versionId: "SYNTHETIC-VERSION",
			byteSize: 1,
			checksum: "synthetic",
			ownerId: userId,
			state: "READY",
		};
		await ensureRow({
			databaseId,
			tableId: "media",
			rowId: `text-media-${i}`,
			data: media,
			permissions: permissions("media", media, id),
		});
		ids.push(id);
	}
	const fixture = { actors, ids };
	await Bun.write(saved, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	return fixture;
}
if (import.meta.main) {
	await fixtures();
	console.log("Synthetic owner text fixtures ready");
}
