import { z } from "zod";

export const postSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	videoPublicId: z.string().min(1),
	videoUrl: z.string().url(),
	videoMimeType: z.string(),
	videoMetadata: z.record(z.string(), z.unknown()).optional(),
	imagePublicId: z.string().optional().nullable(),
	imageUrl: z.string().url().optional().nullable(),
	imageMimeType: z.string().optional().nullable(),
	imageMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type PostData = z.infer<typeof postSchema>;
