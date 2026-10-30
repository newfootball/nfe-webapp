import { z } from "zod";
import { ProfileIdSchema, validate } from "./profile-input";

const id = ProfileIdSchema.shape.id;
export const SIGNAL_REASONS = [
	"INAPPROPRIATE",
	"SPAM",
	"OFFENSIVE",
	"MISLEADING",
	"OTHER",
] as const;
export const SIGNAL_STATUSES = ["PENDING", "REVIEWED", "DISMISSED"] as const;
export const ReportSchema = z.strictObject({
	postId: id,
	reason: z.enum(SIGNAL_REASONS),
	details: z.string().trim().max(65535).default(""),
});
export const AdminPageSchema = z.strictObject({
	kind: z.enum(["users", "reports"]),
	q: z.string().trim().max(128).default(""),
	status: z.enum(SIGNAL_STATUSES).default("PENDING"),
	cursor: id.nullable().default(null),
});
export const DecisionSchema = z.strictObject({
	signalId: id,
	postId: id,
	operation: z.enum(["review", "dismiss", "reject"]),
	signalVersion: z.iso.datetime({ precision: 3 }),
	postVersion: z.iso.datetime({ precision: 3 }),
});
export const validateReport = (v: unknown) => validate(ReportSchema, v);
export const validateAdminPage = (v: unknown) => validate(AdminPageSchema, v);
export const validateDecision = (v: unknown) => validate(DecisionSchema, v);
export type ReportInput = z.infer<typeof ReportSchema>;
export type AdminPageInput = z.infer<typeof AdminPageSchema>;
export type DecisionInput = z.infer<typeof DecisionSchema>;
