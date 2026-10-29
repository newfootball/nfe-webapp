import assert from "node:assert/strict";
import { chmod, open } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Permission, Role, TablesDB, Users } from "node-appwrite";
import { bootstrap } from "./media-bootstrap";
import { endpoint, state } from "./media-local";

export const databaseId = "media-proof";
export async function fixtureSetup() {
	const c = await bootstrap();
	const db = new TablesDB(
		new Client().setEndpoint(endpoint).setProject(c.project).setKey(c.proofKey),
	);
	const saved = Bun.file(`${state}/fixture.json`);
	if (await saved.exists()) return { c, db, fixture: await saved.json() };
	const schema = resolve(import.meta.dir, "../../../tools/appwrite-schema");
	const { provision } = await import(`${schema}/provision.mts`);
	const { provisionProfileV2 } = await import(`${schema}/profile-v2.mts`);
	const { provisionMediaV3 } = await import(`${schema}/media-v3.mts`);
	await provision(db, databaseId);
	await provisionProfileV2(db, databaseId);
	await provisionMediaV3(db, databaseId);
	await provisionMediaV3(db, databaseId);
	const actors = [],
		users = new Users(
			new Client()
				.setEndpoint(endpoint)
				.setProject(c.project)
				.setKey(c.proofKey),
		);
	for (let i = 0; i < 3; i++) {
		const id = `media-actor-${i}`,
			password = `Synthetic-${crypto.randomUUID()}-Aa1!`;
		await users.create({
			userId: id,
			email: `${id}@example.test`,
			password,
			name: `Media ${i}`,
		});
		const session = await users.createSession({ userId: id });
		actors.push({ id, password, secret: session.secret });
		await db.createRow({
			databaseId,
			tableId: "profiles",
			rowId: id,
			permissions:
				i === 2
					? [Permission.read(Role.user(id))]
					: [Permission.read(Role.any())],
			data: {
				name: `Media ${i}`,
				nameFolded: `media ${i}`,
				image: null,
				biography: null,
				localisation: "Paris",
				position: [],
				foot: [],
				userType: "PLAYER",
				isOnboarded: i !== 2,
				createdAt: new Date().toISOString(),
				updatedAt: null,
			},
		});
		await db.createRow({
			databaseId,
			tableId: "private_profiles",
			rowId: id,
			permissions: [Permission.read(Role.user(id))],
			data: { role: "USER" },
		});
	}
	const fixture = { actors, prefix: `nfe-media-55/${crypto.randomUUID()}/` };
	await Bun.write(saved, JSON.stringify(fixture));
	await chmod(`${state}/fixture.json`, 0o600);
	return { c, db, fixture };
}
const allowed = [
	"B2_APPLICATION_KEY_ID",
	"B2_APPLICATION_KEY",
	"B2_BUCKET_NAME",
	"B2_BUCKET_ID",
	"B2_REGION",
	"B2_ENDPOINT",
] as const;
export async function selectedB2Configuration() {
	const saved = Bun.file(`${state}/b2-config.json`);
	if (await saved.exists())
		return (await saved.json()) as Record<(typeof allowed)[number], string>;
	const source =
		"/Users/faharihamadasidi/Sites/github.com/newfootball/nfe-webapp/.env.local";
	const config: Record<string, string> = {};
	for (const line of (await Bun.file(source).text()).split(/\r?\n/)) {
		const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (!m || !allowed.includes(m[1] as (typeof allowed)[number])) continue;
		let v = m[2] ?? "";
		if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
		else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
		else v = v.replace(/\s+#.*$/, "");
		config[m[1]!] = v;
	}
	assert(
		allowed.every((key) => config[key]),
		"Missing selected B2 configuration",
	);
	assert.equal(config.B2_BUCKET_NAME, "nfe-webapp-dev");
	assert.equal(config.B2_REGION, "eu-central-003");
	const file = await open(`${state}/b2-config.json`, "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(config));
	} finally {
		await file.close();
	}
	return config as Record<(typeof allowed)[number], string>;
}
export async function generateMediaFixtures() {
	const path = `${state}/video.mp4`;
	if (!(await Bun.file(path).exists())) {
		const p = Bun.spawn(
			[
				"ffmpeg",
				"-nostdin",
				"-v",
				"error",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=size=1280x720:rate=24",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:sample_rate=48000",
				"-t",
				"12",
				"-c:v",
				"libx264",
				"-b:v",
				"6M",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-movflags",
				"+faststart",
				path,
			],
			{ stdout: "ignore", stderr: "ignore", timeout: 120000 },
		);
		assert.equal(await p.exited, 0, "Fixture generation failed");
		assert(Bun.file(path).size < 20 * 1024 ** 2);
		await chmod(path, 0o600);
	}
	if (!(await Bun.file(`${state}/thumbnail.webp`).exists())) {
		const png = `${state}/frame.png`;
		const image = Bun.spawn(
			[
				"ffmpeg",
				"-y",
				"-nostdin",
				"-v",
				"error",
				"-i",
				path,
				"-frames:v",
				"1",
				"-vf",
				"scale=640:-1",
				png,
			],
			{ stdout: "ignore", stderr: "ignore", timeout: 30000 },
		);
		assert.equal(await image.exited, 0);
		await chmod(png, 0o600);
		const { chromium } = await import("@playwright/test");
		const browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
			headless: true,
		});
		try {
			const page = await browser.newPage();
			const encoded = await page.evaluate(
				async (data) => {
					const img = new Image();
					img.src = data;
					await img.decode();
					const canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					canvas.getContext("2d")!.drawImage(img, 0, 0);
					return canvas.toDataURL("image/webp", 0.85).split(",")[1]!;
				},
				`data:image/png;base64,${Buffer.from(await Bun.file(png).arrayBuffer()).toString("base64")}`,
			);
			await Bun.write(
				`${state}/thumbnail.webp`,
				Buffer.from(encoded, "base64"),
			);
			await chmod(`${state}/thumbnail.webp`, 0o600);
		} finally {
			await browser.close();
		}
	}
}
