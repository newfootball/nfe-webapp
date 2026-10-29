// Kept aligned with tools/appwrite-schema/mapping.mts; checked by contract tests.
export const USER_TYPES = [
	"USER",
	"PLAYER",
	"COACH",
	"RECRUITER",
	"CLUB",
] as const;
export const POSITIONS = [
	"GOALKEEPER",
	"CENTRE_BACK",
	"RIGHT_BACK",
	"LEFT_BACK",
	"DEFENSIVE_MIDFIELDER",
	"CENTRE_MIDFIELDER",
	"ATTACKING_MIDFIELDER",
	"RIGHT_WINGER",
	"LEFT_WINGER",
	"CENTRE_FORWARD",
	"STRIKER",
] as const;
export function publicProfile(row: Record<string, unknown>) {
	return {
		id: String(row.$id),
		name: row.name as string | null,
		image: row.image as string | null,
		biography: row.biography as string | null,
		position: row.position as string[],
		foot: row.foot as string[],
		localisation: row.localisation as string | null,
		userType: String(row.userType),
		isOnboarded: row.isOnboarded === true,
		createdAt: String(row.createdAt),
		updatedAt: row.updatedAt as string | null,
	};
}
export type PublicProfile = ReturnType<typeof publicProfile>;
