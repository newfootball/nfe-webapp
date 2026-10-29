import "@tanstack/react-start/server-only";
import { AppwriteException, Permission, Role, TablesDB } from "node-appwrite";
import {
	AuthFailure,
	client,
	configuration,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import { publicProfile } from "./profile-contract";
import type { Onboarding, ProfileEdit, Validated } from "./profile-input";
export type ProfileError =
	| "unauthorized"
	| "forbidden"
	| "origin"
	| "invalid"
	| "unavailable"
	| "conflict"
	| "notFound";
type Result<T> = { ok: true; value: T } | { ok: false; error: ProfileError };
async function boundary<T>(run: () => Promise<T>): Promise<Result<T>> {
	privateResponse();
	try {
		return { ok: true, value: await run() };
	} catch (e) {
		if (e instanceof AuthFailure)
			return {
				ok: false,
				error: e.reason === "credentials" ? "unauthorized" : e.reason,
			};
		if (e instanceof AppwriteException && e.code === 409)
			return { ok: false, error: "conflict" };
		return { ok: false, error: "unavailable" };
	}
}
function database() {
	const id = process.env.START_APPWRITE_DATABASE;
	if (!id) throw new AuthFailure("unavailable");
	return id;
}
function writer() {
	const key = process.env.START_APPWRITE_PROFILE_WRITER_KEY;
	if (!key || key === configuration().key) throw new AuthFailure("unavailable");
	return new TablesDB(client(configuration()).setKey(key));
}
function acl(id: string, published = false) {
	return published
		? [Permission.read(Role.any())]
		: [Permission.read(Role.user(id)), Permission.read(Role.label("admin"))];
}
async function maybe(db: TablesDB, tableId: string, id: string) {
	try {
		return await db.getRow({ databaseId: database(), tableId, rowId: id });
	} catch (e) {
		if (e instanceof AppwriteException && e.code === 404) return null;
		throw e;
	}
}
async function self() {
	const context = await identity();
	return { ...context, db: new TablesDB(context.sessionClient) };
}
async function transaction<T>(db: TablesDB, run: (id: string) => Promise<T>) {
	const tx = await db.createTransaction({ ttl: 60 });
	try {
		const result = await run(tx.$id);
		await db.updateTransaction({ transactionId: tx.$id, commit: true });
		return result;
	} catch (e) {
		try {
			await db.updateTransaction({ transactionId: tx.$id, rollback: true });
		} catch {}
		throw e;
	}
}
export function readOwnProfile() {
	return boundary(async () => {
		const { viewer, user, db } = await self();
		const [profile, privateRow] = await Promise.all([
			maybe(db, "profiles", viewer.id),
			maybe(db, "private_profiles", viewer.id),
		]);
		return {
			id: viewer.id,
			email: user.email,
			initialized: !!profile && !!privateRow,
			profile: profile ? publicProfile(profile) : null,
			details: privateRow
				? {
						fullName: privateRow.fullName as string | null,
						birthday: privateRow.birthday as string | null,
						license: privateRow.license as string | null,
						clubSize: privateRow.clubSize as number | null,
						clubPosition: privateRow.clubPosition as string | null,
					}
				: null,
		};
	});
}
export type OwnProfile = Extract<
	Awaited<ReturnType<typeof readOwnProfile>>,
	{ ok: true }
>["value"];
export function initializeProfile(input: Validated<Record<string, never>>) {
	return boundary(async () => {
		mutation();
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const [p, d] = await Promise.all([
			maybe(db, "profiles", viewer.id),
			maybe(db, "private_profiles", viewer.id),
		]);
		if (p && d) return { initialized: true as const };
		const write = writer();
		try {
			await transaction(write, async (transactionId) => {
				const ref = { databaseId: database(), rowId: viewer.id, transactionId };
				if (!p)
					await write.createRow({
						...ref,
						tableId: "profiles",
						data: {
							name: null,
							nameFolded: null,
							image: null,
							biography: null,
							localisation: null,
							position: [],
							foot: [],
							userType: "USER",
							isOnboarded: false,
							createdAt: new Date().toISOString(),
							updatedAt: null,
						},
						permissions: acl(viewer.id),
					});
				if (!d)
					await write.createRow({
						...ref,
						tableId: "private_profiles",
						data: { role: "USER" },
						permissions: acl(viewer.id),
					});
			});
		} catch (e) {
			if (!(e instanceof AppwriteException && e.code === 409)) throw e;
			// A concurrent initialization may win. Never upsert or overwrite imported rows.
			const [afterP, afterD] = await Promise.all([
				maybe(db, "profiles", viewer.id),
				maybe(db, "private_profiles", viewer.id),
			]);
			if (!afterP || !afterD) throw e;
		}
		return { initialized: true as const };
	});
}
export function completeOnboarding(input: Validated<Onboarding>) {
	return boundary(async () => {
		mutation();
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const [p, d] = await Promise.all([
			maybe(db, "profiles", viewer.id),
			maybe(db, "private_profiles", viewer.id),
		]);
		if (!p || !d || p.isOnboarded) throw new AuthFailure("forbidden");
		const data = input.data;
		const profile = {
			name: data.name,
			nameFolded: data.name.normalize("NFC").toLocaleLowerCase("fr"),
			biography: data.biography,
			localisation: data.city,
			userType: data.userType,
			isOnboarded: true,
			updatedAt: new Date().toISOString(),
			position: data.userType === "PLAYER" ? data.position : [],
			foot:
				data.userType === "PLAYER"
					? data.foot === "BOTH"
						? ["LEFT", "RIGHT"]
						: [data.foot]
					: [],
		};
		const details: Record<string, unknown> = {};
		if ("birthDate" in data)
			details.birthday = `${data.birthDate}T00:00:00.000Z`;
		if ("clubName" in data) details.fullName = data.clubName;
		if ("license" in data) details.license = data.license || null;
		if (data.userType === "CLUB") {
			details.clubSize = data.clubSize;
			details.clubPosition = data.clubPosition;
		}
		await writePair(viewer.id, profile, details);
		return { updated: true as const };
	});
}
async function writePair(
	id: string,
	profile: Record<string, unknown>,
	details: Record<string, unknown>,
) {
	const db = writer();
	await transaction(db, async (transactionId) => {
		const ref = { databaseId: database(), rowId: id, transactionId };
		await db.updateRow({
			...ref,
			tableId: "profiles",
			data: profile,
			permissions: acl(id, true),
		});
		// An empty patch is supported; no role, imported dimensions or timestamps are replaced.
		await db.updateRow({
			...ref,
			tableId: "private_profiles",
			data: details,
			permissions: acl(id),
		});
	});
}
export function editProfile(input: Validated<ProfileEdit>) {
	return boundary(async () => {
		mutation();
		const { viewer, db } = await self();
		if (!input.valid) throw new AuthFailure("invalid");
		const [p, d] = await Promise.all([
			maybe(db, "profiles", viewer.id),
			maybe(db, "private_profiles", viewer.id),
		]);
		if (!p?.isOnboarded || !d) throw new AuthFailure("forbidden");
		const v = input.data;
		if (
			p.userType !== "CLUB" &&
			(v.clubSize !== null || v.clubPosition !== null)
		)
			throw new AuthFailure("invalid");
		await writePair(
			viewer.id,
			{
				name: v.name,
				nameFolded: v.name.normalize("NFC").toLocaleLowerCase("fr"),
				biography: v.biography,
				localisation: v.localisation,
				position: v.position,
				foot: v.foot,
				updatedAt: new Date().toISOString(),
			},
			{
				fullName: v.fullName,
				birthday: v.birthday ? `${v.birthday}T00:00:00.000Z` : null,
				license: v.license,
				clubSize: v.clubSize,
				clubPosition: v.clubPosition,
			},
		);
		return { updated: true as const };
	});
}
export function readPublicProfile(input: Validated<{ id: string }>) {
	return boundary(async () => {
		if (!input.valid) throw new AuthFailure("invalid");
		// An anonymous, keyless client enforces published-only access, even for admins.
		const db = new TablesDB(client(configuration()));
		let p: Awaited<ReturnType<typeof maybe>>;
		try {
			p = await maybe(db, "profiles", input.data.id);
		} catch (error) {
			if (
				error instanceof AppwriteException &&
				[401, 403, 404].includes(error.code)
			)
				return null;
			throw error;
		}
		if (!p?.isOnboarded) return null;
		return publicProfile(p);
	});
}
