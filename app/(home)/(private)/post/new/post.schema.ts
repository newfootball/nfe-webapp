import { z } from "zod";

export const postSchema = z.object({
	title: z.string(),
	description: z.string(),
	image: z.instanceof(File).optional().nullable(),
	video: z.instanceof(File).optional().nullable(),
});

export type PostData = z.infer<typeof postSchema>;
