// No Appwrite connection or secrets. Not named *.test.*: root `bun test` stays isolated.
import assert from "node:assert/strict";
import { mapping, publicProfile } from "./mapping.mts";
import { enums, tables } from "./schema.mts";

const prisma = await Bun.file(
	new URL("../../prisma/schema.prisma", import.meta.url),
).text();
for (const model of prisma.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
	const [, name, body] = model;
	assert.ok(name && body);
	const scalarNames = [
		...body.matchAll(
			/^\s+(\w+)\s+(String|Int|Boolean|DateTime|Json|SpamScore|UserType|Position|Foot|Role|Gender|MediaType|PostType|PostStatus|SignalReason|SignalStatus|NotificationType)(?:\?|\[\])?\s/gm,
		),
	]
		.map((m) => m[1])
		.sort();
	assert.deepEqual(
		Object.keys(mapping[name] ?? {}).sort(),
		scalarNames,
		`Unmapped fields in ${name}`,
	);
}
for (const definition of prisma.matchAll(/enum (\w+) \{([\s\S]*?)\n\}/g)) {
	const [, name, body] = definition;
	assert.ok(name && body);
	assert.deepEqual(
		enums[name as keyof typeof enums],
		body.trim().split(/\s+/),
		`Enum drift ${name}`,
	);
}
const publicColumns = Object.keys(tables.profiles?.columns ?? {});
for (const sensitive of [
	"email",
	"emailVerified",
	"password",
	"birthday",
	"fullName",
	"license",
	"contract",
	"gender",
	"role",
	"resetToken",
])
	assert.ok(
		!publicColumns.includes(sensitive),
		`Private public column: ${sensitive}`,
	);
const dto = publicProfile({
	$id: "preserved-id",
	email: "private@example.test",
	birthday: "private",
	role: "ADMIN",
});
assert.equal(dto.id, "preserved-id");
assert.ok(!("email" in dto) && !("birthday" in dto) && !("role" in dto));
assert.ok(!("url" in (tables.media?.columns ?? {})), "No canonical signed URL");
for (const table of Object.values(tables))
	for (const index of table.indexes)
		for (const column of index.columns) assert.ok(table.columns[column]);
process.stdout.write(
	`contract: ${Object.keys(mapping).length} models, ${Object.keys(enums).length} enums, privacy allowlist and index references passed\n`,
);
