import "@tanstack/react-start/server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppwriteException, Query, TablesDB } from "node-appwrite";
import {
	AuthFailure,
	client,
	configuration,
	identity,
	mutation,
	privateResponse,
} from "./auth-context.server";
import type {
	AllocateAsset,
	AssetRequest,
	MediaResult,
	PartRequest,
	PublishPost,
} from "./media-contract";
import { MEDIA_READ_TTL_SECONDS, mediaPath } from "./media-contract";
import {
	assertOwner,
	assetTable,
	databaseId,
	maybeRow,
	mediaDB,
	mediaSelf,
	type ownAsset,
	patch,
	privateACL,
	publicACL,
	row,
	transaction,
} from "./media-db.server";
import { storage } from "./media-storage.server";
import {
	allocate,
	cancel,
	finalize,
	objectRef,
	resume,
	signPart,
} from "./media-upload.server";

async function boundary<T>(
	run: () => Promise<T>,
	write = false,
): Promise<MediaResult<T>> {
	privateResponse();
	try {
		if (write) mutation();
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
export const allocateMedia = (v: AllocateAsset) =>
	boundary(() => allocate(v), true);
export const resumeMedia = (v: AssetRequest) => boundary(() => resume(v));
export const signMediaPart = (v: PartRequest) =>
	boundary(() => signPart(v), true);
export const finalizeMedia = (v: AssetRequest) =>
	boundary(() => finalize(v), true);
export const cancelMedia = (v: AssetRequest) => boundary(() => cancel(v), true);

export function publishMedia(v: PublishPost) {
	return boundary(async () => {
		const { ownerId } = await mediaSelf();
		return transaction(async (db, tx) => {
			const ref = { databaseId: databaseId(), transactionId: tx };
			const p = await row(db, "profiles", ownerId, tx);
			if (!p.isOnboarded) throw new AuthFailure("forbidden");
			const video = await row(db, assetTable, v.videoId, tx),
				thumbnail = await row(db, assetTable, v.thumbnailId, tx);
			assertOwner(video, ownerId);
			assertOwner(thumbnail, ownerId);
			if (
				video.kind !== "video" ||
				thumbnail.kind !== "thumbnail" ||
				!video.versionId ||
				!thumbnail.versionId
			)
				throw new AuthFailure("invalid");
			if (
				video.state === "ATTACHED" &&
				thumbnail.state === "ATTACHED" &&
				video.postId === v.requestId &&
				thumbnail.postId === v.requestId
			) {
				const existing = await row(db, "posts", v.requestId, tx);
				if (
					existing.userId !== ownerId ||
					existing.title !== v.title ||
					existing.description !== v.description
				)
					throw new AuthFailure("forbidden");
				return { id: existing.$id, slug: String(existing.slug) };
			}
			if (video.state !== "READY" || thumbnail.state !== "READY")
				throw new AuthFailure("forbidden");
			const now = new Date().toISOString();
			const slug = `${
				v.title
					.normalize("NFKD")
					.replace(/[\u0300-\u036f]/g, "")
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.slice(0, 60)
					.replace(/-+$/, "") || "video"
			}-${v.requestId}`;
			const post = await db.createRow({
				...ref,
				tableId: "posts",
				rowId: v.requestId,
				permissions: publicACL,
				data: {
					userId: ownerId,
					slug,
					title: v.title,
					titleFolded: v.title.normalize("NFC").toLocaleLowerCase("fr"),
					description: v.description,
					descriptionFolded: v.description
						.normalize("NFC")
						.toLocaleLowerCase("fr"),
					type: "video",
					status: "PUBLISHED",
					createdAt: now,
					updatedAt: now,
					publishedAt: now,
				},
			});
			for (const a of [video, thumbnail]) {
				await db.createRow({
					...ref,
					tableId: "media",
					rowId: a.$id,
					permissions: privateACL(ownerId),
					data: {
						postId: post.$id,
						type: a.kind === "video" ? "mainVideo" : "landingImage",
						mimetype: a.mimetype,
						metadataJson: a.metadataJson,
						createdAt: now,
						updatedAt: now,
						provider: "B2",
						bucket: a.bucket,
						objectKey: a.objectKey,
						versionId: a.versionId,
						byteSize: a.byteSize,
						checksum: a.sha256,
						ownerId,
						state: "READY",
					},
				});
				await patch(db, a.$id, { state: "ATTACHED", postId: post.$id }, tx);
			}
			return { id: post.$id, slug };
		});
	}, true);
}
export function replaceMediaAvatar(v: AssetRequest) {
	return boundary(async () => {
		const { ownerId } = await mediaSelf();
		return transaction(async (db, tx) => {
			const p = await row(db, "profiles", ownerId, tx),
				a = await row(db, assetTable, v.assetId, tx);
			assertOwner(a, ownerId);
			const image = mediaPath(a.$id);
			if (
				!p.isOnboarded ||
				a.kind !== "avatar" ||
				!a.versionId ||
				!(a.state === "READY" || (a.state === "ATTACHED" && p.image === image))
			)
				throw new AuthFailure("forbidden");
			await db.updateRow({
				databaseId: databaseId(),
				tableId: "profiles",
				rowId: ownerId,
				transactionId: tx,
				data: { image, updatedAt: new Date().toISOString() },
			});
			await patch(db, a.$id, { state: "ATTACHED" }, tx);
			return { image };
		});
	}, true);
}
async function canRead(a: Awaited<ReturnType<typeof ownAsset>>) {
	if (!["READY", "ATTACHED"].includes(a.state) || !a.versionId)
		throw new AuthFailure("forbidden");
	const publicDB = new TablesDB(client(configuration()));
	if (a.state === "ATTACHED") {
		if (a.kind === "avatar") {
			const p = await maybeRow(publicDB, "profiles", a.ownerId);
			if (p?.isOnboarded && p.image === mediaPath(a.$id)) return;
		} else if (a.postId) {
			const p = await maybeRow(publicDB, "posts", a.postId);
			if (p?.status === "PUBLISHED" && p.userId === a.ownerId) return;
		}
	}
	const { viewer } = await identity();
	assertOwner(a, viewer.id);
	// A superseded avatar has no active parent and cannot be read even by its owner.
	if (a.state === "ATTACHED" && a.kind === "avatar")
		throw new AuthFailure("forbidden");
}
export async function signedMedia(id: string) {
	const a = await row(mediaDB(), assetTable, id);
	await canRead(a);
	const { s3 } = storage();
	try {
		const url = await getSignedUrl(
			s3,
			new GetObjectCommand({
				...objectRef(a),
				VersionId: a.versionId,
				ResponseCacheControl: "private, no-store",
				ResponseContentType: a.mimetype,
				ResponseContentDisposition: "inline",
			}),
			{ expiresIn: MEDIA_READ_TTL_SECONDS },
		);
		return {
			url,
			expiresAt: Date.now() + MEDIA_READ_TTL_SECONDS * 1000,
			mimetype: String(a.mimetype),
		};
	} finally {
		s3.destroy();
	}
}
export const readMedia = (v: AssetRequest) =>
	boundary(() => signedMedia(v.assetId));
export const readPostMediaValue = (v: {
	postId: string;
	kind: "video" | "thumbnail";
}) => boundary(() => signedPostMedia(v.postId, v.kind));
export async function signedPostMedia(
	postId: string,
	kind: "video" | "thumbnail",
) {
	const p = await row(new TablesDB(client(configuration())), "posts", postId);
	if (p.status !== "PUBLISHED") throw new AuthFailure("forbidden");
	const found = await mediaDB().listRows({
		databaseId: databaseId(),
		tableId: assetTable,
		queries: [
			Query.equal("postId", postId),
			Query.equal("kind", kind),
			Query.equal("state", "ATTACHED"),
			Query.limit(1),
		],
		total: false,
	});
	const a = found.rows[0];
	if (!a || a.ownerId !== p.userId) throw new AuthFailure("forbidden");
	return signedMedia(a.$id);
}
