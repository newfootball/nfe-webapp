import { expect, test } from "bun:test";
import {
	ResumeAccountDeletionSchema,
	StartAccountDeletionSchema,
} from "../src/lib/account-deletion-contract";

const requestId = "f8a22f7d-564e-4be3-bf77-6354c8579fb4";

test("account deletion requires an explicit all-messages confirmation", () => {
	const input = { requestId, confirmation: "DELETE_ALL_SENT_RECEIVED" };
	expect(StartAccountDeletionSchema.safeParse(input).success).toBe(true);
	for (const confirmation of ["DELETE", "ANONYMIZE", "", null])
		expect(
			StartAccountDeletionSchema.safeParse({ ...input, confirmation }).success,
		).toBe(false);
	for (const extra of [
		{ userId: "another-user" },
		{ ownerId: "another-user" },
		{ objectKey: "another-user/object" },
		{ phase: "DONE" },
		{ role: "admin" },
	])
		expect(
			StartAccountDeletionSchema.safeParse({ ...input, ...extra }).success,
		).toBe(false);
	expect(
		StartAccountDeletionSchema.safeParse({ ...input, requestId: "invalid" })
			.success,
	).toBe(false);
});

test("recovery accepts only a valid operation identifier", () => {
	expect(
		ResumeAccountDeletionSchema.safeParse({ operationId: requestId }).success,
	).toBe(true);
	expect(
		ResumeAccountDeletionSchema.safeParse({
			operationId: requestId,
			userId: "victim",
		}).success,
	).toBe(false);
	expect(
		ResumeAccountDeletionSchema.safeParse({ operationId: "invalid" }).success,
	).toBe(false);
});
