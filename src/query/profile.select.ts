import type { Prisma } from "@/src/generated/prisma/client";

export const EDITABLE_PROFILE_SELECT = {
	email: true,
	fullName: true,
	biography: true,
	birthday: true,
	localisation: true,
	position: true,
	foot: true,
} as const satisfies Prisma.UserSelect;

export type EditableProfile = Prisma.UserGetPayload<{
	select: typeof EDITABLE_PROFILE_SELECT;
}>;
