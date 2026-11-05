import type { Column, Index, Table } from "./schema.mts";

const text = (size: number, required = true): Column => ({
	type: "string",
	size,
	required,
});
const integer = (required = false): Column => ({ type: "integer", required });
const date = (required = true): Column => ({ type: "datetime", required });

export const homeV1Version = "home-v1";
// Optional columns on existing v1 tables; existing rows keep null values.
export const homeV1Columns: Record<
	string,
	{ columns: Record<string, Column>; indexes: Index[] }
> = {
	profiles: {
		columns: {
			jerseyNumber: integer(),
			clubId: text(36, false),
			clubName: text(128, false),
		},
		indexes: [{ key: "home_club", columns: ["clubId"], type: "key" }],
	},
	posts: {
		columns: {
			matchOpponent: text(64, false),
			matchScoreFor: integer(),
			matchScoreAgainst: integer(),
			matchMinute: integer(),
		},
		indexes: [],
	},
};
export const homeV1Tables: Record<string, Table> = {
	post_views: {
		columns: {
			postId: text(36),
			viewerId: text(36),
			authorId: text(36),
			day: text(10),
			createdAt: date(),
		},
		indexes: [
			{
				key: "view_daily",
				columns: ["postId", "viewerId", "day"],
				type: "unique",
			},
			{
				key: "author_created",
				columns: ["authorId", "createdAt"],
				type: "key",
			},
			{ key: "created", columns: ["createdAt"], type: "key" },
			{ key: "viewer", columns: ["viewerId"], type: "key" },
		],
	},
	featured_posts: {
		columns: {
			postId: text(36),
			weekStart: text(10),
			pinnedBy: text(36),
			createdAt: date(),
		},
		indexes: [
			{ key: "week_unique", columns: ["weekStart"], type: "unique" },
			{ key: "post", columns: ["postId"], type: "key" },
		],
	},
};
export const homeV1Digest = new Bun.CryptoHasher("sha256")
	.update(JSON.stringify({ columns: homeV1Columns, tables: homeV1Tables }))
	.digest("hex");
