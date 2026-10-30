import { z } from "zod";
import { validate } from "./profile-input";

export const MessagingIdSchema = z
	.string()
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/);
export const MessagePageSchema = z.strictObject({
	peerId: MessagingIdSchema.nullable().default(null),
	q: z.string().trim().max(80).default(""),
	cursor: z.string().max(2000).nullable().default(null),
	limit: z.number().int().min(1).max(30).default(20),
});
export const SendMessageSchema = z.strictObject({
	toUserId: MessagingIdSchema,
	content: z.string().trim().min(1).max(2000),
	requestId: z.uuid(),
});
export const MarkReadSchema = z.strictObject({
	ids: z.array(MessagingIdSchema).min(1).max(30),
});
export const MessageSearchSchema = z.strictObject({
	q: z.string().trim().min(2).max(80),
});
const CursorSchema = z.strictObject({
	v: z.literal(1),
	owner: MessagingIdSchema,
	peerId: MessagingIdSchema.nullable(),
	q: z.string().max(80),
	limit: z.number().int().min(1).max(30),
	time: z.iso.datetime({ offset: true }),
	id: MessagingIdSchema,
});
export type MessagePageInput = z.infer<typeof MessagePageSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export const validateMessagePage = (v: unknown) =>
	validate(MessagePageSchema, v);
export const validateSendMessage = (v: unknown) =>
	validate(SendMessageSchema, v);
export const validateMarkRead = (v: unknown) => validate(MarkReadSchema, v);
export const validateMessageSearch = (v: unknown) =>
	validate(MessageSearchSchema, v);
export function messageCursor(
	input: MessagePageInput,
	owner: string,
	time: string,
	id: string,
) {
	return encodeURIComponent(
		JSON.stringify({
			v: 1,
			owner,
			peerId: input.peerId,
			q: input.q,
			limit: input.limit,
			time,
			id,
		}),
	);
}
export function parseMessageCursor(input: MessagePageInput, owner: string) {
	if (!input.cursor) return null;
	const c = CursorSchema.parse(JSON.parse(decodeURIComponent(input.cursor)));
	if (
		c.owner !== owner ||
		c.peerId !== input.peerId ||
		c.q !== input.q ||
		c.limit !== input.limit
	)
		throw new Error("Invalid cursor");
	return c;
}
