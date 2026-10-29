import assert from "node:assert/strict";
import { Query, TablesDB, Users } from "node-appwrite";
import { type Credentials, clientFor } from "./appwrite.mts";
import { restore } from "./archive.mts";
import { bytes, hash, privateDir, privateWrite } from "./core.mts";
import { type MediaJournal, mediaClient, recoverMedia } from "./media.mts";
import { directory } from "./topology.mts";

export async function recover(
	path: string,
	target: string,
	confirmation: string,
	env: string,
	journal?: MediaJournal,
) {
	const started = performance.now();
	const archive = await restore(path, target, confirmation);
	const volumesRestoredMs = Math.round(performance.now() - started);
	const client = await mediaClient(env);
	try {
		const mapping = await recoverMedia(
			client,
			archive.media.prefix,
			`nfe-backup-47/${target.slice(6)}/`,
			archive.media.versions,
			journal,
		);
		const original = archive.fixture.media;
		assert.ok(mapping[original.versionId]);
		const restored = mapping[original.versionId];
		const credentials = archive.fixture.credentials as Credentials;
		const db = new TablesDB(
			clientFor("http://127.0.0.1:19548/v1", credentials),
		);
		for (const [tableId, count] of Object.entries(
			archive.fixture.snapshot.counts,
		)) {
			const rows = await db.listRows({
				databaseId: "business",
				tableId,
				queries: [Query.limit(100), Query.orderAsc("$id")],
				total: true,
			});
			assert.equal(rows.total, count);
			assert.equal(
				hash(JSON.stringify(rows.rows)),
				archive.fixture.snapshot.digests[tableId],
				"restored_rows_or_acl_drift",
			);
		}
		assert.equal(
			(
				await new Users(
					clientFor("http://127.0.0.1:19548/v1", credentials),
				).list()
			).total,
			archive.fixture.snapshot.users,
		);
		const row = await db.getRow({
			databaseId: "business",
			tableId: "media",
			rowId: "media-a",
		});
		assert.equal(row.versionId, original.versionId);
		assert.equal(row.checksum, `sha256:${restored.sha256}`);
		// B2 cannot preserve version IDs. Rebind the recovered reference to verified copied bytes.
		await db.updateRow({
			databaseId: "business",
			tableId: "media",
			rowId: "media-a",
			data: { objectKey: restored.key, versionId: restored.versionId },
		});
		await privateDir(`${directory(target)}/media`);
		for (const [name, content] of Object.entries(
			archive.fixture.sourceMedia,
		) as [string, string][]) {
			assert.match(name, /^(overwritten|deleted)\.bin$/);
			await privateWrite(`${directory(target)}/media/${name}`, bytes(content));
			assert.equal(
				hash(await Bun.file(`${directory(target)}/media/${name}`).bytes()),
				hash(bytes(content)),
			);
		}
		await privateWrite(
			`${directory(target)}/version-map.json`,
			JSON.stringify(mapping),
		);
		return {
			archive,
			mapping,
			volumesRestoredMs,
			totalRestoreMs: Math.round(performance.now() - started),
			sourceMediaHashes: Object.fromEntries(
				Object.entries(archive.fixture.sourceMedia).map(([name, content]) => [
					name,
					hash(bytes(content as string)),
				]),
			),
		};
	} finally {
		client.destroy();
	}
}
