import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getUserLogin } from "@/src/query/user.query";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID || "",
			clientSecret: env.GOOGLE_CLIENT_SECRET || "",
		},
	},
	emailAndPassword: {
		enabled: true,
		async signInWithEmailAndPassword({ email, password }: { email: string; password: string }) {
			const user = await getUserLogin(email, password);
			if (!user) {
				throw new Error("Invalid credentials");
			}
			return {
				user: {
					id: user.id,
					name: user.fullName,
					email: user.email,
					image: user.image,
					emailVerified: user.emailVerified,
				},
			};
		},
	},
	plugins: [nextCookies()],
	secret: env.NEXTAUTH_SECRET || process.env.BETTER_AUTH_SECRET || "",
	baseURL: env.WEBSITE_URL,
	redirectAfterLogin: "/",
	redirectAfterLogout: "/sign-in",
});

export type Session = typeof auth.$Infer.Session;