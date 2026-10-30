import "@tanstack/react-start/server-only";
import {
	AppwriteException,
	type Models,
	Permission,
	Role,
} from "node-appwrite";
import {
	AuthFailure,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import { assetTable, privateACL, publicACL } from "./media-db.server";
import {
	type DeletePost,
	type LifecycleProgress,
	type PostTransition,
	PurgeInventorySchema,
	permitsTransition,
	type ReplacePostMedia,
} from "./post-lifecycle-contract";
import {
	assertLifecycleLease,
	BATCH_SIZE,
	claimLifecycleOperation,
	fencedLifecycleCheckpoint,
	LifecycleConflict,
	lifecycleDB,
	lifecycleTransaction,
	lockTable,
	operationTable,
	optionalRow,
	postRows,
	ref,
} from "./post-lifecycle-db.server";
import {
	deleteExactVersion,
	inventoryAsset,
} from "./post-lifecycle-storage.server";
import { postRevision } from "./post-text.server";
import type { PostTextResult } from "./post-text-contract";
import type { Validated } from "./profile-input";

const Conflict = LifecycleConflict;
async function boundary<T>(run: () => Promise<T>): Promise<PostTextResult<T>> {
	privateResponse();
	try {
		mutation();
		return { ok: true, value: await run() };
	} catch (e) {
		if (
			e instanceof Conflict ||
			(e instanceof AppwriteException && e.code === 409)
		)
			return { ok: false, error: "conflict" };
		if (e instanceof AuthFailure)
			return {
				ok: false,
				error: e.reason === "credentials" ? "unauthorized" : e.reason,
			};
		return { ok: false, error: "unavailable" };
	}
}
async function actor<T>(input: Validated<T>) {
	const { viewer } = await identity();
	if (!input.valid) throw new AuthFailure("invalid");
	return { owner: viewer.id, data: input.data, db: lifecycleDB() };
}
async function owned(
	db: ReturnType<typeof lifecycleDB>,
	id: string,
	owner: string,
	tx?: string,
) {
	const p = await optionalRow(db, "posts", id, tx);
	if (!p || p.userId !== owner) throw new AuthFailure("forbidden");
	return p;
}
async function unlocked(
	db: ReturnType<typeof lifecycleDB>,
	id: string,
	tx?: string,
) {
	if (await optionalRow(db, lockTable, id, tx)) throw new Conflict();
}
export function transitionPost(input: Validated<PostTransition>) {
	return boundary(async () => {
		const { owner, data: v, db } = await actor(input),
			before = await owned(db, v.id, owner);
		if (postRevision(before) !== v.expectedRevision) throw new Conflict();
		if (!permitsTransition(before.status, v.target))
			throw new AuthFailure("forbidden");
		return lifecycleTransaction(db, async (tx) => {
			await unlocked(db, v.id, tx);
			const p = await db.updateRow({
				...ref("posts", v.id, tx),
				permissions:
					v.target === "PUBLISHED"
						? publicACL
						: [...privateACL(owner), Permission.read(Role.label("admin"))],
				data: {
					status: v.target,
					updatedAt: new Date(
						Math.max(Date.now(), Date.parse(before.updatedAt) + 1),
					).toISOString(),
				},
			});
			if (postRevision(await owned(db, v.id, owner)) !== v.expectedRevision)
				throw new Conflict();
			return { id: p.$id, status: v.target };
		});
	});
}
function operationDTO(op: Models.DefaultRow): LifecycleProgress {
	return {
		operationId: op.$id,
		done: op.phase === "DONE",
		phase: String(op.phase),
	};
}
async function replay(
	db: ReturnType<typeof lifecycleDB>,
	requestId: string,
	owner: string,
	postId: string,
	kind: string,
	signature: string,
) {
	const op = await optionalRow(db, operationTable, requestId);
	if (!op) return null;
	if (
		op.ownerId !== owner ||
		op.postId !== postId ||
		op.kind !== kind ||
		op.signature !== signature
	)
		throw new AuthFailure("forbidden");
	return operationDTO(op);
}
async function start(
	input: Validated<ReplacePostMedia | DeletePost>,
	kind: "REPLACE" | "DELETE",
) {
	const { owner, data: v, db } = await actor(input),
		signature = JSON.stringify(v);
	const previous = await replay(db, v.requestId, owner, v.id, kind, signature);
	if (previous) return previous;
	const before = await owned(db, v.id, owner);
	if (postRevision(before) !== v.expectedRevision) throw new Conflict();
	const assets = await postRows(db, assetTable, v.id, 11),
		media = await postRows(db, "media", v.id, 11);
	if (
		assets.length > 10 ||
		media.length > 10 ||
		assets.some((a) => a.ownerId !== owner || a.state !== "ATTACHED") ||
		media.some(
			(m) =>
				!assets.some(
					(a) =>
						a.$id === m.$id &&
						a.versionId === m.versionId &&
						a.objectKey === m.objectKey &&
						a.bucket === m.bucket &&
						a.sha256 === m.checksum,
				),
		)
	)
		throw new AuthFailure("forbidden");
	// Inventories are prepared while attached assets are immutable, then verified in the transaction.
	const inventory = await Promise.all(assets.map(inventoryAsset));
	const newIds =
		kind === "REPLACE" && "videoId" in v ? [v.videoId, v.thumbnailId] : [];
	if (
		newIds.length &&
		(newIds[0] === newIds[1] ||
			newIds.some((id) => assets.some((a) => a.$id === id)))
	)
		throw new AuthFailure("invalid");
	return lifecycleTransaction(db, async (tx) => {
		await unlocked(db, v.id, tx);
		// Same parent write anchor as57; status and ACL commit together for deletion.
		await db.updateRow({
			...ref("posts", v.id, tx),
			...(kind === "DELETE"
				? {
						permissions: [
							...privateACL(owner),
							Permission.read(Role.label("admin")),
						],
					}
				: {}),
			data: {
				status: kind === "DELETE" ? "ARCHIVED" : before.status,
				updatedAt: new Date(
					Math.max(Date.now(), Date.parse(before.updatedAt) + 1),
				).toISOString(),
			},
		});
		if (postRevision(await owned(db, v.id, owner)) !== v.expectedRevision)
			throw new Conflict();
		for (const a of assets) {
			const current = await db.getRow(ref(assetTable, a.$id, tx));
			if (
				current.$updatedAt !== a.$updatedAt ||
				current.state !== "ATTACHED" ||
				current.postId !== v.id
			)
				throw new Conflict();
			await db.updateRow({
				...ref(assetTable, a.$id, tx),
				data: {
					state: "CANCELLED",
					postId: null,
					leaseUntil: null,
					updatedAt: new Date().toISOString(),
				},
			});
		}
		if (kind === "REPLACE") {
			for (const m of media) await db.deleteRow(ref("media", m.$id, tx));
			for (const [index, id] of newIds.entries()) {
				const a = await db.getRow(ref(assetTable, id, tx));
				if (
					a.ownerId !== owner ||
					a.kind !== (index === 0 ? "video" : "thumbnail") ||
					a.state !== "READY" ||
					a.postId ||
					!a.versionId ||
					!/^[a-f0-9]{64}$/.test(a.sha256)
				)
					throw new AuthFailure("forbidden");
				await db.updateRow({
					...ref(assetTable, id, tx),
					data: {
						state: "ATTACHED",
						postId: v.id,
						updatedAt: new Date().toISOString(),
					},
				});
				const liveAsset = await db.getRow(ref(assetTable, id));
				if (
					liveAsset.$updatedAt !== a.$updatedAt ||
					liveAsset.state !== "READY" ||
					liveAsset.postId
				)
					throw new Conflict();
				await db.createRow({
					...ref("media", id, tx),
					permissions: privateACL(owner),
					data: {
						postId: v.id,
						type: index === 0 ? "mainVideo" : "landingImage",
						mimetype: a.mimetype,
						metadataJson: a.metadataJson,
						createdAt: a.createdAt,
						updatedAt: new Date().toISOString(),
						provider: "B2",
						bucket: a.bucket,
						objectKey: a.objectKey,
						versionId: a.versionId,
						byteSize: a.byteSize,
						checksum: a.sha256,
						ownerId: owner,
						state: "READY",
					},
				});
			}
		}
		if (kind === "REPLACE") failAt("replacement-before-journal");
		await db.createRow({
			...ref(lockTable, v.id, tx),
			permissions: [],
			data: { operationId: v.requestId, ownerId: owner },
		});
		const op = await db.createRow({
			...ref(operationTable, v.requestId, tx),
			permissions: [],
			data: {
				postId: v.id,
				ownerId: owner,
				kind,
				signature,
				inventoryJson: JSON.stringify(inventory),
				phase: kind === "DELETE" ? "CHILDREN" : "OBJECTS",
				childStep: 0,
				assetStep: 0,
				versionStep: 0,
				token: null,
				leaseUntil: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		});
		return operationDTO(op);
	});
}
export const replacePostMedia = (input: Validated<ReplacePostMedia>) =>
	boundary(() => start(input, "REPLACE"));
export const deletePost = (input: Validated<DeletePost>) =>
	boundary(() => start(input, "DELETE"));

const childTables = [
	"likes",
	"comments",
	"favorites",
	"signals",
	"media",
] as const;
// Synthetic failure points live on the server only, never in a client payload.
function failAt(point: string) {
	if (
		process.env.START_LIFECYCLE_SYNTHETIC_PROJECT &&
		process.env.START_LIFECYCLE_SYNTHETIC_PROJECT ===
			process.env.START_APPWRITE_PROJECT
	) {
		if (process.env.START_LIFECYCLE_FAILURE_POINT === `crash:${point}`)
			process.exit(86);
		if (process.env.START_LIFECYCLE_FAILURE_POINT === point)
			throw new Error("Synthetic lifecycle interruption");
	}
}
export function resumePostLifecycle(input: Validated<{ operationId: string }>) {
	return boundary(async () => {
		const { owner, data: v, db } = await actor(input),
			token = crypto.randomUUID();
		const op = await claimLifecycleOperation(db, v.operationId, owner, token);
		if (op.phase === "DONE") return operationDTO(op);
		const checkpoint = (
			data: Record<string, unknown>,
			run?: (tx: string) => Promise<void>,
		) => fencedLifecycleCheckpoint(db, op.$id, token, data, run);
		try {
			failAt("after-withdrawal");
			if (op.phase === "CHILDREN") {
				const table = childTables[op.childStep];
				if (!table) return operationDTO(await checkpoint({ phase: "OBJECTS" }));
				const children = await postRows(db, table, op.postId);
				return operationDTO(
					await checkpoint(
						{
							childStep:
								children.length < BATCH_SIZE ? op.childStep + 1 : op.childStep,
						},
						async (tx) => {
							for (const c of children)
								await db.deleteRow(ref(table, c.$id, tx));
						},
					),
				);
			}
			if (op.phase === "OBJECTS") {
				const assets = PurgeInventorySchema.parse(JSON.parse(op.inventoryJson)),
					a = assets[op.assetStep];
				if (!a) return operationDTO(await checkpoint({ phase: "FINALIZE" }));
				const version = a.versions[op.versionStep];
				if (!version)
					return operationDTO(
						await checkpoint({ assetStep: op.assetStep + 1, versionStep: 0 }),
					);
				await assertLifecycleLease(db, op.$id, token);
				await deleteExactVersion(db, a, version);
				failAt("after-version-delete");
				return operationDTO(
					await checkpoint({ versionStep: op.versionStep + 1 }),
				);
			}
			if (op.phase !== "FINALIZE") throw new AuthFailure("forbidden");
			return operationDTO(
				await checkpoint({ phase: "DONE" }, async (tx) => {
					if (op.kind === "DELETE") {
						for (const table of [...childTables, assetTable])
							if ((await postRows(db, table, op.postId, 1, tx)).length)
								throw new Conflict();
						await owned(db, op.postId, owner, tx);
						const privateRow = await optionalRow(
							db,
							"post_private",
							op.postId,
							tx,
						);
						if (privateRow)
							await db.deleteRow(ref("post_private", op.postId, tx));
						await db.deleteRow(ref("posts", op.postId, tx));
					}
					await db.deleteRow(ref(lockTable, op.postId, tx));
				}),
			);
		} catch (e) {
			// Release this attempt when possible. A crash retains a time-bounded lease;
			// the next attempt fences its token and replays an exact version deletion.
			try {
				await checkpoint({});
			} catch {}
			throw e;
		}
	});
}

export async function readPostLifecycle(
	input: Validated<{ id: string }>,
): Promise<PostTextResult<LifecycleProgress | null>> {
	privateResponse();
	try {
		const { owner, data: v, db } = await actor(input);
		await owned(db, v.id, owner);
		const lock = await optionalRow(db, lockTable, v.id);
		if (!lock) return { ok: true, value: null };
		const op = await db.getRow(ref(operationTable, lock.operationId));
		if (op.ownerId !== owner) throw new AuthFailure("forbidden");
		return { ok: true, value: operationDTO(op) };
	} catch (e) {
		if (e instanceof AuthFailure)
			return {
				ok: false,
				error: e.reason === "credentials" ? "unauthorized" : e.reason,
			};
		return { ok: false, error: "unavailable" };
	}
}
