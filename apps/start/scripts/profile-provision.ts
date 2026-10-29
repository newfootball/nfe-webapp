import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Client, Query, TablesDB } from "node-appwrite";
import { bootstrap } from "./profile-bootstrap";
import { endpoint } from "./profile-local";
// Optional tooling has its own dependency installation and TypeScript checks.
// Keep it outside Start's compilation graph, and load only for the synthetic proof.
export async function loadSchemaProvisioners() {
	const directory = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const baseline: {
		provision: (db: TablesDB, id: string) => Promise<unknown>;
	} = await import(`${directory}/provision.mts`);
	const extension: {
		provisionProfileV2: (db: TablesDB, id: string) => Promise<unknown>;
	} = await import(`${directory}/profile-v2.mts`);
	if (
		typeof baseline.provision !== "function" ||
		typeof extension.provisionProfileV2 !== "function"
	)
		throw new Error("Schema proof tooling is unavailable");
	return { ...baseline, ...extension };
}
export const profileDatabase = `profile-proof-${crypto.randomUUID().slice(0, 8)}`;
export async function provisionProfiles() {
	const { provision, provisionProfileV2 } = await loadSchemaProvisioners();
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
	const { provisionProfileV2 } = await loadSchemaProvisioners();
	const before = await snapshot();
	await provisionProfileV2(db, profileDatabase);
	await provisionProfileV2(db, profileDatabase);
	assert.deepEqual(
		await snapshot(),
		before,
		"v2 replay changed rows, dates, nulls, version markers or ACLs",
	);
}
