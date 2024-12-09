import { z } from "zod";

export const postSchema = z.object({
	title: z.string(),
	description: z.string(),
	image: z.instanceof(File).optional(),
	video: z.instanceof(File).optional(),
});

export type PostData = z.infer<typeof postSchema>;
