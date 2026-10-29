import assert from "node:assert/strict";
import { Client, Query, TablesDB } from "node-appwrite";
import { provisionProfileV2 } from "../../../tools/appwrite-schema/profile-v2.mts";
import { provision } from "../../../tools/appwrite-schema/provision.mts";
import { bootstrap } from "./profile-bootstrap";
import { endpoint } from "./profile-local";
export const profileDatabase = `profile-proof-${crypto.randomUUID().slice(0, 8)}`;
export async function provisionProfiles() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	// v1 is installed on a fresh database; subsequent runs must use the applied v2 marker.
	try {
		await db.getRow({
			databaseId: profileDatabase,
			tableId: "schema_versions",
			rowId: "v2-club-profile",
		});
	} catch (e) {
		if ((e as { code?: number }).code !== 404) throw e;
		await provision(db, profileDatabase);
	}
	await provisionProfileV2(db, profileDatabase);
	return c;
}
if (import.meta.main) {
	await provisionProfiles();
	process.stdout.write(
		"Profile schema v1 + additive v2 ready (synthetic only).\n",
	);
}

export async function verifyProfileSchemaRerun(
	credentials: Awaited<ReturnType<typeof bootstrap>>,
) {
	const db = new TablesDB(
		new Client()
			.setEndpoint(endpoint)
			.setProject(credentials.project)
			.setKey(credentials.proofKey),
	);
	const snapshot = async () =>
		Promise.all(
			["profiles", "private_profiles", "schema_versions"].map((tableId) =>
				db.listRows({
					databaseId: profileDatabase,
					tableId,
					queries: [Query.orderAsc("$id"), Query.limit(100)],
				}),
			),
		);
	const before = await snapshot();
	await provisionProfileV2(db, profileDatabase);
	await provisionProfileV2(db, profileDatabase);
	assert.deepEqual(
		await snapshot(),
		before,
		"v2 replay changed rows, dates, nulls, version markers or ACLs",
	);
}
