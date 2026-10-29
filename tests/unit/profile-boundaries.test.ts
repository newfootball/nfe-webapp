import { beforeEach, describe, expect, it, mock } from "bun:test";

let viewer: string | null = "current-user";
let failWrite = false;
const invalidated: string[] = [];
const record: Record<string, unknown> = {
	email: "player@example.test",
	fullName: "Test Player",
	biography: null,
	birthday: null,
	localisation: "Paris",
	position: [],
	foot: [],
	password: "private-hash",
	resetToken: "private-reset-token",
	role: "ADMIN",
};
const read = mock(
	async (args: { where: { id: string }; select: Record<string, boolean> }) =>
		Object.fromEntries(
			Object.keys(args.select).map((key) => [key, record[key]]),
		),
);
const write = mock(
	async (_args: {
		where: { id: string };
		data: Record<string, unknown>;
		select: { id: boolean };
	}) => {
		if (failWrite) throw new Error("private database diagnostic");
		return { id: viewer, password: "private-hash" };
	},
);

mock.module("@/lib/prisma", () => ({
	prisma: { user: { findUnique: read, update: write } },
}));
mock.module("@/src/query/user.query", () => ({
	getUserSessionId: async () => viewer,
}));
mock.module("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));
mock.module("next/cache", () => ({
	revalidatePath: (path: string) => invalidated.push(path),
}));

const { getEditableProfile } = await import("@/src/query/profile.query");
const { updateUser } = await import(
	"@/app/(home)/(private)/profile/edit-user/edit-user.action"
);

beforeEach(() => {
	viewer = "current-user";
	failWrite = false;
	read.mockClear();
	write.mockClear();
	invalidated.length = 0;
});

describe("profile server boundaries", () => {
	it("rejects unauthenticated reads and writes before accessing the database", async () => {
		viewer = null;
		expect(await getEditableProfile()).toBeNull();
		expect(await updateUser(record)).toEqual({
			success: false,
			error: "unauthorized",
		});
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(invalidated).toHaveLength(0);
	});

	it("loads the current user's editable fields without authentication secrets", async () => {
		const profile = await getEditableProfile();
		expect(read.mock.calls[0]?.[0].where).toEqual({ id: "current-user" });
		expect(profile?.email).toBe("player@example.test");
		expect(profile).not.toHaveProperty("password");
		expect(profile).not.toHaveProperty("resetToken");
		expect(profile).not.toHaveProperty("role");
	});

	it("ignores forged ownership and privilege fields when saving", async () => {
		const result = await updateUser({
			...record,
			id: "another-user",
			userId: "another-user",
		});
		expect(result).toEqual({ success: true });
		const args = write.mock.calls[0]?.[0];
		expect(args?.where).toEqual({ id: "current-user" });
		expect(args?.data).not.toHaveProperty("id");
		expect(args?.data).not.toHaveProperty("userId");
		expect(args?.data).not.toHaveProperty("role");
		expect(args?.data).not.toHaveProperty("password");
		expect(args?.data).not.toHaveProperty("resetToken");
		expect(invalidated).toContain("/profile");
		expect(invalidated).toContain("/user/current-user");
	});

	it("rejects invalid input without a write or cache invalidation", async () => {
		expect(await updateUser({ email: "invalid" })).toEqual({
			success: false,
			error: "invalid-profile",
		});
		expect(write).not.toHaveBeenCalled();
		expect(invalidated).toHaveLength(0);
	});

	it("returns a renderable failure without exposing database diagnostics", async () => {
		failWrite = true;
		expect(await updateUser(record)).toEqual({
			success: false,
			error: "update-error",
		});
		expect(invalidated).toHaveLength(0);
	});
});
