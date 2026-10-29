import { atomicPrivate, type Checkpoint, digest } from "./checkpoint";
import type { SourceUser } from "./source";

export type TargetUser = {
	id: string;
	email: string;
	verified: boolean;
	password: string;
	labels: string[];
	marker?: string;
};
export interface Target {
	get(id: string): Promise<TargetUser | null>;
	byEmail(email: string): Promise<TargetUser[]>;
	create(user: SourceUser, password: string): Promise<void>;
	mark(id: string, marker: string): Promise<void>;
	verify(id: string, value: boolean): Promise<void>;
	admin(id: string): Promise<void>;
}
export type Report = {
	version: 1;
	mode: "dry-run" | "apply";
	total: number;
	counts: Record<string, number>;
	exceptions: { ref: string; reasons: string[] }[];
	audit: Checkpoint["audit"];
};
const compatible = (hash: string | null | undefined): hash is string =>
	typeof hash === "string" &&
	/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/.test(hash);
export function plan(users: SourceUser[], admins: string[]) {
	const ids = new Map<string, number>();
	const emails = new Map<string, number>();
	for (const user of users) {
		ids.set(user.id, (ids.get(user.id) ?? 0) + 1);
		if (user.email) {
			const email = user.email.toLowerCase();
			emails.set(email, (emails.get(email) ?? 0) + 1);
		}
	}
	return users.map((user) => {
		const reasons: string[] = [];
		const warnings: string[] = [];
		if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(user.id))
			reasons.push("invalid_public_id");
		if (
			!user.email ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
			user.email.length > 320
		)
			reasons.push("incomplete_email");
		if (
			(ids.get(user.id) ?? 0) > 1 ||
			(user.email && (emails.get(user.email.toLowerCase()) ?? 0) > 1)
		)
			reasons.push("source_collision");
		if (user.email && user.email !== user.email.toLowerCase())
			reasons.push("email_case_preservation_unsupported");
		const credentials = user.accounts.filter(
			(a) => a.providerId === "credential",
		);
		const credential = credentials[0];
		if (
			credentials.length > 1 ||
			(credential && credential.accountId !== user.id)
		)
			reasons.push("ambiguous_credential");
		if (!compatible(credential?.password))
			reasons.push(
				credential ? "incompatible_credential" : "no_active_credential",
			);
		if (user.legacyPassword)
			warnings.push(
				credential?.password && credential.password !== user.legacyPassword
					? "legacy_password_diverges"
					: "legacy_password_not_authoritative",
			);
		if (user.accounts.some((a) => a.providerId === "google"))
			warnings.push("google_subject_relink_required");
		if (
			user.accounts.some(
				(a) => !["google", "credential"].includes(a.providerId),
			)
		)
			reasons.push("unknown_provider");
		if (user.role === "ADMIN" && !admins.includes(user.id))
			reasons.push("admin_approval_required");
		return { user, password: credential?.password, reasons, warnings };
	});
}
export async function runImport(options: {
	users: SourceUser[];
	admins: string[];
	target?: Target;
	targetBinding: string;
	checkpoint: Checkpoint;
	checkpointPath?: string;
	apply: boolean;
	afterOwned?: () => Promise<void>;
}) {
	const { users, admins, checkpoint: cp, target, apply } = options;
	if (
		admins.some((id) => !users.some((u) => u.id === id && u.role === "ADMIN"))
	)
		throw new Error("admin_policy_mismatch");
	const binding = digest(cp.key, {
		users,
		admins,
		target: options.targetBinding,
	});
	if (cp.binding && cp.binding !== binding)
		throw new Error("checkpoint_binding_changed");
	cp.binding = binding;
	if (apply && (!target || !options.checkpointPath))
		throw new Error("apply_configuration_required");
	const report: Report = {
		version: 1,
		mode: apply ? "apply" : "dry-run",
		total: users.length,
		counts: {},
		exceptions: [],
		audit: [...cp.audit],
	};
	const count = (name: string) => {
		report.counts[name] = (report.counts[name] ?? 0) + 1;
	};
	const save = async () => {
		if (apply && options.checkpointPath)
			await atomicPrivate(options.checkpointPath, cp);
	};
	await save();
	for (const item of plan(users, admins)) {
		const { user, password, reasons, warnings } = item;
		const ref = digest(cp.key, user.id);
		const marker = digest(cp.key, { binding, id: user.id });
		const exception = [...reasons, ...warnings];
		if (exception.length) report.exceptions.push({ ref, reasons: exception });
		if (reasons.length || !password) {
			count("deferred");
			continue;
		}
		if (!target) {
			count("eligible_offline");
			continue;
		}
		try {
			let existing = await target.get(user.id);
			const emailMatches = await target.byEmail(user.email as string);
			if (emailMatches.some((other) => other.id !== user.id)) {
				count("target_collision");
				report.exceptions.push({ ref, reasons: ["target_email_collision"] });
				continue;
			}
			if (
				existing &&
				(existing.marker !== marker ||
					existing.email !== user.email ||
					existing.password !== password ||
					(user.role !== "ADMIN" && existing.labels.includes("admin")))
			) {
				count("target_collision");
				report.exceptions.push({
					ref,
					reasons: ["target_identity_unowned_or_changed"],
				});
				continue;
			}
			if (cp.entries[ref] && !existing) {
				count("target_collision");
				report.exceptions.push({ ref, reasons: ["checkpoint_target_missing"] });
				continue;
			}
			if (!apply) {
				count(existing ? "already_owned" : "eligible");
				continue;
			}
			if (!existing) {
				cp.entries[ref] = "intent";
				await save();
				await target.create(user, password);
				// A crash before this marker fails closed on replay; never adopt by email/ID alone.
				await target.mark(user.id, marker);
				cp.entries[ref] = "owned";
				await save();
				await options.afterOwned?.();
				existing = await target.get(user.id);
			}
			if (
				!existing ||
				existing.marker !== marker ||
				existing.email !== user.email ||
				existing.password !== password
			)
				throw new Error("ownership_lost");
			if (
				cp.entries[ref] === "done" &&
				existing.verified === user.emailVerified &&
				(user.role !== "ADMIN" || existing.labels.includes("admin"))
			) {
				count("unchanged");
				continue;
			}
			await target.verify(user.id, user.emailVerified);
			if (user.role === "ADMIN") {
				// Persist intended privileged operation before applying it; final report confirms success.
				cp.audit.push({ ref, operation: "admin_approved" });
				await save();
				await target.admin(user.id);
				cp.audit.push({ ref, operation: "admin_applied" });
				await save();
				report.audit = [...cp.audit];
			}
			cp.entries[ref] = "done";
			await save();
			count("imported");
		} catch {
			count("failed");
			report.exceptions.push({ ref, reasons: ["target_operation_failed"] });
		}
	}
	return report;
}
