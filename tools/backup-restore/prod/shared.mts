import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { bytes, command, hash, protectedRead } from "../core.mts";

export const service = "itnkyqrvjpb6ovqt9r3tk8tu";
export const host = "root@2.24.50.72";
export const sourceBucket = "nfe-webapp-prod";
export const backupBucket = "nfe-backups-prod";
export const volumes = [
	"config",
	"certificates",
	"uploads",
	"imports",
	"functions",
	"sites",
	"builds",
];

export const args = parseArgs({
	options: {
		env: { type: "string" },
		key: { type: "string" },
		name: { type: "string" },
		tier: { type: "string", default: "daily" },
		run: { type: "boolean", default: false },
	},
}).values;

export async function secrets(path: string | undefined, keys: string[]) {
	assert.ok(path, "env_path_required");
	const text = (await protectedRead(path)).toString();
	const values: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
		if (m && keys.includes(m[1]))
			values[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	for (const k of keys) assert.ok(values[k], `env_missing_${k}`);
	return values;
}

export async function archiveKey(path: string | undefined) {
	assert.ok(path, "key_path_required");
	const key = bytes((await protectedRead(path)).toString().trim());
	assert.equal(key.byteLength, 32, "archive_key_invalid");
	return key;
}

export const remote = (script: string) =>
	command([
		"ssh",
		"-o",
		"BatchMode=yes",
		"-o",
		"ConnectTimeout=10",
		host,
		script,
	]);

export type Entry = { name: string; size: number; sha256: string };
export type Header = {
	format: "nfe-prod-backup-v1";
	meta: Record<string, unknown>;
	entries: Entry[];
};

export function pack(
	meta: Record<string, unknown>,
	parts: Record<string, Uint8Array>,
) {
	const entries = Object.entries(parts).map(([name, data]) => ({
		name,
		size: data.byteLength,
		sha256: hash(data),
	}));
	const header = Buffer.from(
		JSON.stringify({ format: "nfe-prod-backup-v1", meta, entries }),
	);
	const size = Buffer.alloc(4);
	size.writeUInt32BE(header.byteLength);
	return Buffer.concat([size, header, ...Object.values(parts)]);
}

export function unpack(data: Uint8Array) {
	const buf = Buffer.from(data);
	const length = buf.readUInt32BE(0);
	const header = JSON.parse(buf.subarray(4, 4 + length).toString()) as Header;
	assert.equal(header.format, "nfe-prod-backup-v1", "archive_format");
	const parts: Record<string, Buffer> = {};
	let offset = 4 + length;
	for (const e of header.entries) {
		const part = buf.subarray(offset, offset + e.size);
		assert.equal(hash(part), e.sha256, `archive_entry_${e.name}`);
		parts[e.name] = part;
		offset += e.size;
	}
	assert.equal(offset, buf.byteLength, "archive_trailing_bytes");
	return { header, parts };
}

export const elapsed = (start: number) => Math.round(performance.now() - start);
