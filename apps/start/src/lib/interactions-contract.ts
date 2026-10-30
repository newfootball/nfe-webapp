import type { PublicPost } from "./feed-contract";
export type InteractionState = {
	postId: string;
	viewerId: string | null;
	liked: boolean;
	favorited: boolean;
	likes: number;
	comments: number;
};
// Return-only integration contract for #58. No outbox or durable delivery is claimed.
export type InteractionEvent = {
	version: 1;
	type:
		| "LIKE_CREATED"
		| "LIKE_REMOVED"
		| "COMMENT_CREATED"
		| "COMMENT_REMOVED"
		| "FAVORITE_CREATED"
		| "FAVORITE_REMOVED";
	eventId: string;
	actorId: string;
	recipientId: string;
	postId: string;
	entityId: string;
	occurredAt: string;
};
export type InteractionChange = {
	state: InteractionState;
	event: InteractionEvent | null;
};
export type PublicComment = {
	id: string;
	content: string;
	createdAt: string;
	author: { id: string; name: string | null };
	canDelete: boolean;
};
export type CommentPage = {
	viewerId: string | null;
	comments: PublicComment[];
	nextCursor: string | null;
};
export type FavoritePage = {
	viewerId: string;
	posts: PublicPost[];
	nextCursor: string | null;
};
export function optimisticInteraction(
	state: InteractionState,
	kind: "like" | "favorite",
	active: boolean,
): InteractionState {
	if (kind === "favorite") return { ...state, favorited: active };
	return {
		...state,
		liked: active,
		likes: Math.max(0, state.likes + Number(active) - Number(state.liked)),
	};
}
