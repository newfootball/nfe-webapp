import { Query } from "node-appwrite";
import {
	atomicPrivate,
	type Checkpoint,
	digest,
	load,
	withLock,
} from "../identity-import/checkpoint";
import {
	runImport as importIdentities,
	type Target,
	type TargetUser,
} from "../identity-import/importer";
import type { SourceUser } from "../identity-import/source";
import type { AppwriteTarget as IdentityTarget } from "../identity-import/target";

type Listed = {
	$id: string;
	email: string;
	prefs: { nfeIdentityImport?: string };
};
const expectedBinding = (
	cp: Checkpoint,
	users: SourceUser[],
	admins: string[],
	binding: string,
) =>
	digest(cp.key, {
		users,
		admins,
		target: binding,
		preservePasswordless: true,
		normalizeEmails: true,
	});
async function listTarget(target: IdentityTarget) {
	const users: Listed[] = [];
	let offset = 0;
	for (;;) {
		const page = await target.users.list<{ nfeIdentityImport?: string }>({
			queries: [Query.limit(100), Query.offset(offset)],
		});
		users.push(...page.users);
		offset += page.users.length;
		if (!page.users.length || offset >= page.total) break;
	}
	return users;
}
// Every identity on the target must be importer-owned: checkpointed, carrying
// the HMAC marker of the current binding (or of the previous binding during a
// frozen rebuild) and matching the source email. A frozen rebuild may also see
// owned identities that left the source; they are deleted by rebaseIdentities.
export async function preflightIdentities(
	target: IdentityTarget,
	users: SourceUser[],
	admins: string[],
	path: string,
	binding: string,
	rebuild = false,
) {
	const cp = await load(path);
	const next = expectedBinding(cp, users, admins, binding);
	const previous = cp.binding && cp.binding !== next ? cp.binding : null;
	if (previous && !rebuild)
		throw new Error("identity_checkpoint_binding_mismatch");
	const markers = (id: string) =>
		[next, ...(previous ? [previous] : [])].map((b) =>
			digest(cp.key, { binding: b, id }),
		);
	const translate = new Map<string, string>();
	for (const user of await listTarget(target)) {
		const source = users.find((u) => u.id === user.$id),
			ref = digest(cp.key, user.$id),
			marker = user.prefs.nfeIdentityImport ?? "";
		if (
			!["owned", "done"].includes(cp.entries[ref] ?? "") ||
			!markers(user.$id).includes(marker) ||
			(source ? user.email !== source.email?.toLowerCase() : !previous)
		)
			throw new Error("foreign_target_identity");
		translate.set(user.$id, markers(user.$id)[0] as string);
	}
	// The importer performs the same password, role and checkpoint checks that
	// apply will enforce, without creating users or persisting this checkpoint.
	// During a rebuild the previous marker is presented as the next one so the
	// dry run evaluates the users that will remain after rebasing.
	const view: Target = {
		get: async (id) => rebased(await target.get(id), translate),
		byEmail: async (email) =>
			(await target.byEmail(email)).map(
				(u) => rebased(u, translate) as TargetUser,
			),
		create: target.create.bind(target),
		mark: target.mark.bind(target),
		verify: target.verify.bind(target),
		admin: target.admin.bind(target),
		delete: target.delete.bind(target),
	};
	const report = await importIdentities({
		users,
		admins,
		target: view,
		targetBinding: binding,
		checkpoint: { ...cp, binding: previous ? "" : cp.binding },
		apply: false,
		preservePasswordless: true,
		normalizeEmails: true,
	});
	if (
		report.counts.failed ||
		report.counts.target_collision ||
		report.counts.deferred ||
		(report.counts.eligible ?? 0) + (report.counts.already_owned ?? 0) !==
			users.length
	)
		throw new Error("identity_preflight_incomplete");
	return { rebase: previous !== null };
}
const rebased = (user: TargetUser | null, translate: Map<string, string>) =>
	user && translate.has(user.id)
		? { ...user, marker: translate.get(user.id) }
		: user;
// Frozen rebuild of importer-owned identities: owned users still in the source
// receive the marker of the new binding; owned users absent from the source are
// deleted. Each step persists so an interrupted pass resumes and fails closed on
// anything it does not own.
export async function rebaseIdentities(options: {
	target: IdentityTarget;
	users: SourceUser[];
	admins: string[];
	path: string;
	binding: string;
}) {
	const { target, users, admins, path } = options;
	return withLock(path, async () => {
		const cp = await load(path);
		const next = expectedBinding(cp, users, admins, options.binding);
		if (!cp.binding || cp.binding === next) return { remarked: 0, deleted: 0 };
		const previous = cp.binding;
		const sourceRefs = new Map(users.map((u) => [digest(cp.key, u.id), u]));
		const seen = new Set<string>();
		const listed = (await listTarget(target)).map((user) => {
			const ref = digest(cp.key, user.$id);
			const oldMarker = digest(cp.key, { binding: previous, id: user.$id }),
				newMarker = digest(cp.key, { binding: next, id: user.$id });
			const marker = user.prefs.nfeIdentityImport ?? "";
			seen.add(ref);
			if (
				!["owned", "done"].includes(cp.entries[ref] ?? "") ||
				![oldMarker, newMarker].includes(marker)
			)
				throw new Error("foreign_target_identity");
			return { id: user.$id, ref, stale: marker === oldMarker, newMarker };
		});
		let remarked = 0,
			deleted = 0;
		for (const user of listed) {
			if (!sourceRefs.has(user.ref)) {
				await target.delete(user.id);
				delete cp.entries[user.ref];
				deleted++;
				await atomicPrivate(path, cp);
				continue;
			}
			if (user.stale) {
				await target.mark(user.id, user.newMarker);
				remarked++;
			}
		}
		for (const [ref, state] of Object.entries(cp.entries)) {
			if (state === "intent" || seen.has(ref)) continue;
			if (sourceRefs.has(ref)) throw new Error("owned_identity_missing");
			delete cp.entries[ref];
			deleted++;
		}
		cp.binding = next;
		await atomicPrivate(path, cp);
		return { remarked, deleted };
	});
}
