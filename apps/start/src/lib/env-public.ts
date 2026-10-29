import { z } from "zod";

// Only explicitly selected public variables may enter isomorphic code.
export const publicEnv = z
	.object({
		VITE_APP_NAME: z.string().trim().min(1).default("Next Football Experience"),
	})
	.parse({ VITE_APP_NAME: import.meta.env.VITE_APP_NAME });
