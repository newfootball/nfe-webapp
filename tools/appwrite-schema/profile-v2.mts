// Additive v2. The applied v1 manifest and digest are intentionally unchanged.
import assert from "node:assert/strict";
import type { Models, TablesDB } from "node-appwrite";
import { codeOf, waitFor } from "./provision.mts";
import { schemaDigest, schemaVersion } from "./schema.mts";
export const profileV2Version = "v2-club-profile";
export const profileV2Definition = {
	private_profiles: {
		clubSize: { type: "integer", required: false },
		clubPosition: { type: "string", size: 255, required: false },
	},
};
export const profileV2Digest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify(profileV2Definition))
	.digest("hex");
export async function provisionProfileV2(db: TablesDB, databaseId: string) {
	const baseline = await db.getRow({
		databaseId,
		tableId: "schema_versions",
		rowId: schemaVersion,
	});
	assert.equal(baseline.digest, schemaDigest, "v1 prerequisite differs");
	const table = await db.getTable({ databaseId, tableId: "private_profiles" });
	assert.deepEqual(table.$permissions, [], "v2 requires private table ACL");
	assert.equal(table.rowSecurity, true, "v2 requires row security");
	const marker = {
		databaseId,
		tableId: "schema_versions",
		rowId: profileV2Version,
	};
	let applied: Models.DefaultRow | undefined;
	try {
		applied = await db.getRow<Models.DefaultRow>(marker);
	} catch (e) {
		if (codeOf(e) !== 404) throw e;
	}
	if (applied)
		assert.equal(applied.digest, profileV2Digest, "v2 digest differs");
	for (const [key, definition] of Object.entries(
		profileV2Definition.private_profiles,
	)) {
		const ref = { databaseId, tableId: "private_profiles", key };
		let column: Awaited<ReturnType<TablesDB["getColumn"]>> | undefined;
		try {
			column = await db.getColumn(ref);
		} catch (e) {
			if (codeOf(e) !== 404) throw e;
		}
		if (!column) {
			if (applied) throw new Error("Applied v2 column missing");
			if (definition.type === "integer")
				await db.createIntegerColumn({ ...ref, required: false });
			else await db.createStringColumn({ ...ref, required: false, size: 255 });
		}
		await waitFor(async () => (await db.getColumn(ref)).status);
		const actual = await db.getColumn(ref);
		assert.equal(actual.type, definition.type);
		assert.equal(actual.required, false);
		assert.equal(actual.array, false);
		assert.equal((actual as unknown as { default: unknown }).default, null);
		if (definition.type === "string")
			assert.equal((actual as unknown as { size: number }).size, 255);
	}
	if (!applied)
		await db.createRow({
			...marker,
			data: { digest: profileV2Digest, appliedAt: new Date().toISOString() },
			permissions: [],
		});
	return { version: profileV2Version, digest: profileV2Digest };
}
