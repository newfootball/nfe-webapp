import type { PublicProfile } from "./profile-contract";

export type FollowState = {
	targetId: string;
	viewerId: string | null;
	following: boolean;
	followers: number;
	followings: number;
};
// Versioned business contract for #58. Concurrent delete acknowledgments may
// repeat the same eventId; this is not exactly-once emission. Consumers dedupe
// by eventId before delivery; no translated
// text, credentials or private profile fields cross this boundary. Delivery and
// durable notification outbox are deliberately owned by #58.
export type FollowEvent = {
	version: 1;
	type: "FOLLOW_CREATED" | "FOLLOW_REMOVED";
	eventId: string;
	actorId: string;
	recipientId: string;
	edgeId: string;
	occurredAt: string;
};
export type FollowChange = { state: FollowState; event: FollowEvent | null };
export type FollowPage = {
	viewerId: string;
	profiles: PublicProfile[];
	nextCursor: string | null;
};
export function optimisticFollow(
	state: FollowState,
	following: boolean,
): FollowState {
	return {
		...state,
		following,
		followers: Math.max(
			0,
			state.followers + Number(following) - Number(state.following),
		),
	};
}
