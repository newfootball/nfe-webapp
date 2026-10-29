import { Permission, Role } from "node-appwrite";

export const adminRead = Permission.read(Role.label("admin"));
const readers = (...ids: string[]) =>
	[...new Set(ids)].map((id) => Permission.read(Role.user(id)));
// No create/update/delete grants. A trusted server must validate actor and references first.
export function permissions(
	table: string,
	data: Record<string, unknown>,
	id: string,
): string[] {
	switch (table) {
		case "profiles":
			return data.isOnboarded
				? [Permission.read(Role.any())]
				: [adminRead, ...readers(id)];
		case "private_profiles":
			return [adminRead, ...readers(id)];
		case "posts":
			return data.status === "PUBLISHED"
				? [Permission.read(Role.any())]
				: [adminRead, ...readers(String(data.userId))];
		case "favorites":
		case "notifications":
			return readers(String(data.userId));
		case "messages":
			return readers(String(data.fromUserId), String(data.toUserId));
		case "signals":
		case "post_private":
			return [adminRead];
		case "media":
			return [adminRead, ...readers(String(data.ownerId))];
		case "follows":
			return [Permission.read(Role.any())];
		// Likes/comments can leak a draft's existence; server checks parent visibility on reads.
		case "likes":
		case "comments":
			return [];
		case "schema_versions":
			return [];
		default:
			throw new Error(`Unknown table ${table}`);
	}
}
