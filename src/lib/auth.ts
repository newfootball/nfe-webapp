import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { comparePassword, hashPassword } from "@/src/lib/password";

const secret = env.BETTER_AUTH_SECRET || env.NEXTAUTH_SECRET;
if (!secret) {
	throw new Error(
		"BETTER_AUTH_SECRET is required. Set it in your environment variables.",
	);
}

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	socialProviders: {
		...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
					},
				}
			: {}),
	},
	emailAndPassword: {
		enabled: true,
		password: {
			hash: hashPassword,
			verify: async ({ hash, password }) => {
				return comparePassword(password, hash);
			},
		},
	},
	plugins: [nextCookies()],
	secret,
	baseURL: env.WEBSITE_URL || process.env.NEXT_PUBLIC_APP_URL,
	trustedOrigins: [
		env.WEBSITE_URL,
		process.env.NEXT_PUBLIC_APP_URL,
		env.BETTER_AUTH_TRUSTED_ORIGIN,
	].filter(Boolean) as string[],
});

export type Session = typeof auth.$Infer.Session;
