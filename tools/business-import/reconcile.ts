import type { AcceptedLoss } from "./accepted-loss";
import { BUSINESS_TABLES, normalizeRow, UNIQUE_INDEXES } from "./contract";
import type { ProjectionRow } from "./projection";
import type { BusinessSource } from "./source";

export type Category =
	| "accepted_loss"
	| "intended_transformation"
	| "unexplained";
export type Discrepancy = {
	category: Category;
	scope: string;
	detail: string;
	count: number;
};
type Check = { checked: number; mismatched: number; ids: string[] };
export type Reconciliation = {
	version: 1;
	ok: boolean;
	unexplained: number;
	identities: { source: number; target: number; ok: boolean };
	entities: Record<
		string,
		{
			source: number;
			active: number;
			omitted: number;
			tables: Record<string, { expected: number; actual: number }>;
		}
	>;
	tables: Record<
		string,
		{
			expected: number;
			actual: number;
			missing: string[];
			extra: string[];
			changed: string[];
		}
	>;
	orphans: Record<string, Check>;
	uniqueness: Record<string, Check>;
	counters: Record<string, Check>;
	rights: Record<string, Check>;
	samples: Record<string, Check & { fields: string[] }>;
	discrepancies: Discrepancy[];
};
export type ReconcileInput = {
	source: BusinessSource;
	active: BusinessSource;
	rows: ProjectionRow[];
	target: Record<string, ProjectionRow[]>;
	loss: AcceptedLoss;
	identities: { source: number; target: number };
	sampleSize?: number;
};
const LIMIT = 25;
const cap = (ids: string[]) => ids.slice(0, LIMIT);
const check = (): Check => ({ checked: 0, mismatched: 0, ids: [] });
const fail = (item: Check, id: string) => {
	item.mismatched++;
	if (item.ids.length < LIMIT) item.ids.push(id);
};
const str = (value: unknown) => (typeof value === "string" ? value : null);
const admin = 'read("label:admin")';
const any = 'read("any")';
const user = (id: string | null) => (id === null ? [] : [`read("user:${id}")`]);
// Effective read rights derived from the row data alone, independently of the
// projection code that produced the rows.
function expectedRights(
	row: ProjectionRow,
	postOwner: Map<string, string | null>,
): string[] | null {
	const d = row.data;
	switch (row.table) {
		case "profiles":
			return d.isOnboarded === true ? [any] : [admin, ...user(row.id)];
		case "private_profiles":
			return [admin, ...user(row.id)];
		case "posts":
			return d.status === "PUBLISHED" ? [any] : [admin, ...user(str(d.userId))];
		case "post_private":
		case "signals":
			return [admin];
		case "media":
			return user(postOwner.get(str(d.postId) ?? "") ?? null);
		case "media_assets":
			return user(str(d.ownerId));
		case "follows":
			return [any];
		case "likes":
		case "comments":
			return [];
		case "favorites":
			return user(str(d.userId));
		case "messages":
			return [
				...new Set([...user(str(d.fromUserId)), ...user(str(d.toUserId))]),
			];
		case "message_conversations":
			return [
				...new Set([
					...user(str(d.participantA)),
					...user(str(d.participantB)),
				]),
			];
		case "notifications_v1":
			return user(str(d.recipientId));
		default:
			return null;
	}
}
const REFERENCES: [string, string, string][] = [
	["posts", "userId", "profiles"],
	["media", "postId", "posts"],
	["media", "$id", "media_assets"],
	["media_assets", "ownerId", "profiles"],
	["media_assets", "postId", "posts"],
	["follows", "followerId", "profiles"],
	["follows", "followingId", "profiles"],
	["likes", "postId", "posts"],
	["likes", "userId", "profiles"],
	["favorites", "postId", "posts"],
	["favorites", "userId", "profiles"],
	["comments", "postId", "posts"],
	["comments", "userId", "profiles"],
	["signals", "postId", "posts"],
	["signals", "userId", "profiles"],
	["messages", "fromUserId", "profiles"],
	["messages", "toUserId", "profiles"],
	["message_conversations", "participantA", "profiles"],
	["message_conversations", "participantB", "profiles"],
	["message_conversations", "latestId", "messages"],
	["notifications_v1", "recipientId", "profiles"],
	["post_private", "$id", "posts"],
	["private_profiles", "$id", "profiles"],
];
function tally<T>(items: T[], key: (item: T) => string | null) {
	const counts = new Map<string, number>();
	for (const item of items) {
		const k = key(item);
		if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	return counts;
}
function compareCounts(
	name: string,
	source: Map<string, number>,
	target: Map<string, number>,
	into: Record<string, Check>,
) {
	const item = check();
	for (const key of new Set([...source.keys(), ...target.keys()])) {
		item.checked++;
		if ((source.get(key) ?? 0) !== (target.get(key) ?? 0)) fail(item, key);
	}
	into[name] = item;
}
const conversationPairs = (messages: BusinessSource["Message"]) =>
	new Set(
		messages.map((m) => JSON.stringify([m.fromUserId, m.toUserId].sort())),
	).size;
export function reconcile(input: ReconcileInput): Reconciliation {
	const { source, active, loss } = input;
	const sampleSize = input.sampleSize ?? LIMIT;
	const expected = new Map<string, ProjectionRow>();
	for (const row of input.rows) {
		const key = `${row.table}:${row.id}`;
		if (expected.has(key)) throw new Error("duplicate_projection_row");
		expected.set(key, normalizeRow(row));
	}
	const target: Record<string, ProjectionRow[]> = {};
	for (const table of BUSINESS_TABLES) {
		const rows = input.target[table];
		if (!rows) throw new Error("incomplete_target_listing");
		target[table] = rows.map((row) => normalizeRow(row));
	}
	const discrepancies: Discrepancy[] = [];
	const unexplained = (scope: string, detail: string, count: number) => {
		if (count > 0)
			discrepancies.push({ category: "unexplained", scope, detail, count });
	};
	const intended = (scope: string, detail: string, count: number) =>
		discrepancies.push({
			category: "intended_transformation",
			scope,
			detail,
			count,
		});
	const avatars = (s: BusinessSource) => s.User.filter((u) => u.image).length;
	const omittedMedia = source.Media.length - active.Media.length;
	const omittedAvatars = avatars(source) - avatars(active);
	const acceptedMedia = loss.entries.filter(
		(e) => e.status === "missing_accepted" && e.source === "media",
	).length;
	const acceptedAvatars = loss.entries.filter(
		(e) => e.status === "missing_accepted" && e.source === "avatar",
	).length;
	if (acceptedMedia)
		discrepancies.push({
			category: "accepted_loss",
			scope: "Media",
			detail: "media_pair_omitted_by_manifest",
			count: acceptedMedia,
		});
	if (acceptedAvatars)
		discrepancies.push({
			category: "accepted_loss",
			scope: "User.image",
			detail: "avatar_pair_omitted_by_manifest",
			count: acceptedAvatars,
		});
	unexplained(
		"Media",
		"omitted_without_accepted_loss",
		Math.abs(omittedMedia - acceptedMedia),
	);
	unexplained(
		"User.image",
		"omitted_without_accepted_loss",
		Math.abs(omittedAvatars - acceptedAvatars),
	);
	for (const entity of Object.keys(source) as (keyof BusinessSource)[])
		if (entity !== "Media" && source[entity].length !== active[entity].length)
			unexplained(
				entity,
				"active_source_differs",
				Math.abs(source[entity].length - active[entity].length),
			);
	const conversations = conversationPairs(active.Message);
	const plan: Record<string, Record<string, number>> = {
		User: {
			profiles: active.User.length,
			private_profiles: active.User.length,
		},
		Post: { posts: active.Post.length, post_private: active.Post.length },
		Media: {
			media: active.Media.length,
			media_assets: 2 * active.Media.length + 2 * avatars(active),
		},
		Follow: { follows: active.Follow.length },
		Like: { likes: active.Like.length },
		Favorite: { favorites: active.Favorite.length },
		Comment: { comments: active.Comment.length },
		Message: {
			messages: active.Message.length,
			message_conversations: conversations,
		},
		Notification: {
			notifications_v1: active.Notification.length,
			notifications: 0,
		},
		PostSignal: { signals: active.PostSignal.length },
	};
	intended(
		"User",
		"split_into_profiles_and_private_profiles",
		active.User.length,
	);
	intended("Post", "split_into_posts_and_post_private", active.Post.length);
	intended(
		"Media",
		"delivery_and_original_assets_per_media",
		2 * active.Media.length,
	);
	intended(
		"User.image",
		"delivery_and_original_assets_per_avatar",
		2 * avatars(active),
	);
	intended(
		"Message",
		"conversations_derived_from_participant_pairs",
		conversations,
	);
	intended(
		"Notification",
		"legacy_ids_hashed_into_notifications_v1",
		active.Notification.length,
	);
	intended("Account", "owned_by_identity_import", 0);
	const entities: Reconciliation["entities"] = {};
	for (const [entity, tables] of Object.entries(plan)) {
		const key = entity as keyof BusinessSource;
		entities[entity] = {
			source: source[key].length,
			active: active[key].length,
			omitted: source[key].length - active[key].length,
			tables: Object.fromEntries(
				Object.entries(tables).map(([table, count]) => [
					table,
					{ expected: count, actual: target[table]?.length ?? 0 },
				]),
			),
		};
		for (const [table, count] of Object.entries(tables))
			unexplained(
				table,
				"entity_volume_differs",
				Math.abs(count - (target[table]?.length ?? 0)),
			);
	}
	const tables: Reconciliation["tables"] = {};
	for (const table of BUSINESS_TABLES) {
		const wanted = input.rows.filter((row) => row.table === table);
		const actual = target[table] ?? [];
		const seen = new Set<string>();
		const missing: string[] = [],
			extra: string[] = [],
			changed: string[] = [];
		for (const row of actual) {
			const projected = expected.get(`${table}:${row.id}`);
			seen.add(row.id);
			if (!projected) extra.push(row.id);
			else if (JSON.stringify(projected) !== JSON.stringify(row))
				changed.push(row.id);
		}
		for (const row of wanted) if (!seen.has(row.id)) missing.push(row.id);
		if (wanted.length !== expectedCount(plan, table))
			unexplained(
				table,
				"projection_volume_differs",
				Math.abs(wanted.length - expectedCount(plan, table)),
			);
		unexplained(table, "missing_rows", missing.length);
		unexplained(table, "foreign_rows", extra.length);
		unexplained(table, "changed_rows", changed.length);
		tables[table] = {
			expected: wanted.length,
			actual: actual.length,
			missing: cap(missing),
			extra: cap(extra),
			changed: cap(changed),
		};
	}
	const ids = Object.fromEntries(
		BUSINESS_TABLES.map((table) => [
			table,
			new Set((target[table] ?? []).map((row) => row.id)),
		]),
	);
	const orphans: Record<string, Check> = {};
	for (const [table, column, parent] of REFERENCES) {
		const item = check();
		for (const row of target[table] ?? []) {
			const value = column === "$id" ? row.id : row.data[column];
			if (value === null || value === undefined) continue;
			item.checked++;
			if (typeof value !== "string" || !ids[parent]?.has(value))
				fail(item, row.id);
		}
		orphans[`${table}.${column}->${parent}`] = item;
		unexplained(`${table}.${column}`, "orphan_reference", item.mismatched);
	}
	const uniqueness: Record<string, Check> = {};
	for (const [table, indexes] of Object.entries(UNIQUE_INDEXES))
		for (const columns of indexes) {
			const item = check();
			const seen = new Map<string, string>();
			for (const row of target[table] ?? []) {
				const values = columns.map((column) => row.data[column]);
				if (values.some((value) => value === null || value === undefined))
					continue;
				item.checked++;
				const key = JSON.stringify(values);
				if (seen.has(key)) fail(item, row.id);
				else seen.set(key, row.id);
			}
			const name = `${table}(${columns.join(",")})`;
			uniqueness[name] = item;
			unexplained(name, "duplicate_unique_key", item.mismatched);
		}
	const counters: Record<string, Check> = {};
	const rowsOf = (table: string) => target[table] ?? [];
	const field = (column: string) => (row: ProjectionRow) =>
		str(row.data[column]);
	const unread = (column: string) => (row: ProjectionRow) =>
		row.data.readAt === null ? str(row.data[column]) : null;
	compareCounts(
		"likes_per_post",
		tally(active.Like, (l) => l.postId),
		tally(rowsOf("likes"), field("postId")),
		counters,
	);
	compareCounts(
		"comments_per_post",
		tally(active.Comment, (c) => c.postId),
		tally(rowsOf("comments"), field("postId")),
		counters,
	);
	compareCounts(
		"favorites_per_user",
		tally(active.Favorite, (f) => f.userId),
		tally(rowsOf("favorites"), field("userId")),
		counters,
	);
	compareCounts(
		"followers_per_user",
		tally(active.Follow, (f) => f.followingId),
		tally(rowsOf("follows"), field("followingId")),
		counters,
	);
	compareCounts(
		"following_per_user",
		tally(active.Follow, (f) => f.followerId),
		tally(rowsOf("follows"), field("followerId")),
		counters,
	);
	compareCounts(
		"posts_per_user",
		tally(active.Post, (p) => p.userId),
		tally(rowsOf("posts"), field("userId")),
		counters,
	);
	compareCounts(
		"media_per_post",
		tally(active.Media, (m) => m.postId),
		tally(rowsOf("media"), field("postId")),
		counters,
	);
	compareCounts(
		"unread_notifications_per_user",
		tally(active.Notification, (n) => (n.readAt === null ? n.userId : null)),
		tally(rowsOf("notifications_v1"), unread("recipientId")),
		counters,
	);
	compareCounts(
		"unread_messages_per_recipient",
		tally(active.Message, (m) => (m.readAt === null ? m.toUserId : null)),
		tally(rowsOf("messages"), unread("toUserId")),
		counters,
	);
	for (const [name, item] of Object.entries(counters))
		unexplained(name, "derived_counter_differs", item.mismatched);
	const postOwner = new Map(
		rowsOf("posts").map((row) => [row.id, str(row.data.userId)]),
	);
	const rights: Record<string, Check> = {};
	for (const table of BUSINESS_TABLES) {
		const item = check();
		for (const row of rowsOf(table)) {
			item.checked++;
			const wanted = expectedRights(row, postOwner);
			if (
				wanted === null ||
				JSON.stringify([...wanted].sort()) !== JSON.stringify(row.permissions)
			)
				fail(item, row.id);
		}
		rights[table] = item;
		unexplained(table, "effective_rights_differ", item.mismatched);
	}
	const samples: Reconciliation["samples"] = {};
	for (const table of BUSINESS_TABLES) {
		const item = { ...check(), fields: [] as string[] };
		const fields = new Set<string>();
		const candidates = [...expected.values()]
			.filter((row) => row.table === table)
			.sort((a, b) => a.id.localeCompare(b.id));
		const step = Math.max(1, Math.ceil(candidates.length / sampleSize));
		const byId = new Map(rowsOf(table).map((row) => [row.id, row]));
		for (let index = 0; index < candidates.length; index += step) {
			const wanted = candidates[index];
			if (!wanted) continue;
			item.checked++;
			const actual = byId.get(wanted.id);
			if (!actual) {
				fail(item, wanted.id);
				fields.add("$missing");
				continue;
			}
			const differing = Object.keys(wanted.data).filter(
				(key) =>
					JSON.stringify(wanted.data[key]) !== JSON.stringify(actual.data[key]),
			);
			if (
				JSON.stringify(wanted.permissions) !==
				JSON.stringify(actual.permissions)
			)
				differing.push("$permissions");
			if (differing.length) {
				fail(item, wanted.id);
				for (const key of differing) fields.add(key);
			}
		}
		item.fields = [...fields].sort();
		samples[table] = item;
		unexplained(table, "sample_fields_differ", item.mismatched);
	}
	const identities = {
		source: input.identities.source,
		target: input.identities.target,
		ok: input.identities.source === input.identities.target,
	};
	unexplained(
		"identities",
		"target_identity_count_differs",
		identities.ok ? 0 : Math.abs(identities.source - identities.target),
	);
	const total = discrepancies
		.filter((d) => d.category === "unexplained")
		.reduce((sum, d) => sum + d.count, 0);
	return {
		version: 1,
		ok: total === 0,
		unexplained: total,
		identities,
		entities,
		tables,
		orphans,
		uniqueness,
		counters,
		rights,
		samples,
		discrepancies,
	};
}
function expectedCount(
	plan: Record<string, Record<string, number>>,
	table: string,
) {
	return Object.values(plan).reduce(
		(sum, tables) => sum + (tables[table] ?? 0),
		0,
	);
}
// Counts and categories only: ids and samples stay in the private report file.
export function redactReconciliation(reconciliation: Reconciliation) {
	const strip = (items: Record<string, Check>) =>
		Object.fromEntries(
			Object.entries(items).map(([name, item]) => [
				name,
				{ checked: item.checked, mismatched: item.mismatched },
			]),
		);
	return {
		version: reconciliation.version,
		ok: reconciliation.ok,
		unexplained: reconciliation.unexplained,
		identities: reconciliation.identities,
		entities: reconciliation.entities,
		tables: Object.fromEntries(
			Object.entries(reconciliation.tables).map(([table, item]) => [
				table,
				{
					expected: item.expected,
					actual: item.actual,
					missing: item.missing.length,
					extra: item.extra.length,
					changed: item.changed.length,
				},
			]),
		),
		orphans: strip(reconciliation.orphans),
		uniqueness: strip(reconciliation.uniqueness),
		counters: strip(reconciliation.counters),
		rights: strip(reconciliation.rights),
		samples: Object.fromEntries(
			Object.entries(reconciliation.samples).map(([table, item]) => [
				table,
				{
					checked: item.checked,
					mismatched: item.mismatched,
					fields: item.fields,
				},
			]),
		),
		discrepancies: reconciliation.discrepancies,
	};
}
