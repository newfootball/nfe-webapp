import { z } from "zod";

export const postSchema = z.object({
	title: z.string(),
	description: z.string(),
	image: z.string().optional(),
});

export type PostData = z.infer<typeof postSchema>;
