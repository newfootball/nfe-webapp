import "@tanstack/react-start/server-only";
import { z } from "zod";

// No service credentials are needed by the foundation. Read private env per request.
export function getServerEnv() {
	return z
		.object({
			NODE_ENV: z
				.enum(["development", "production", "test"])
				.default("development"),
		})
		.parse({ NODE_ENV: process.env.NODE_ENV });
}
