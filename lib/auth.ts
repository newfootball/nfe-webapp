import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getUserLogin } from "@/query/user.query";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

class InvalidLoginError extends CredentialsSignin {
	code = "Invalid identifier or password";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	adapter: PrismaAdapter(prisma),
	theme: {
		logo: "/logo.svg",
	},

	providers: [
		CredentialsProvider({
			name: "Credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			authorize: async (credentials) => {
				if (!credentials?.email || !credentials?.password)
					throw new CredentialsSignin("Invalid credentials");

				// Add logic here to look up the user from the credentials supplied
				const user = await getUserLogin(
					credentials.email as string,
					credentials.password as string,
				);

				if (!user) throw new InvalidLoginError();

				console.log({ user });

				return {
					id: user?.id as string,
					name: user?.name,
					email: user?.email,
					role: user?.role,
					image: user?.image,
				};
			},
		}),
		Google({
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		}),
	],
	secret: process.env.NEXTAUTH_SECRET,

	pages: {
		signIn: "/sign-in",
	},
	callbacks: {
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.sub as string; // Associer l'ID utilisateur à la session
				session.user.name = token.name || null;
			}
			return session;
		},

		async jwt({ token, user }) {
			if (user) {
				token.sub = user.id; // Lier l'utilisateur au token JWT
				token.name = user.name || null;
			}
			return token;
		},

		async redirect({ url, baseUrl }) {
			// Redirection après authentification
			if (url.startsWith(baseUrl)) {
				return url; // Rediriger vers la page d'origine
			}
			return "/"; // Rediriger par défaut vers /dashboard
		},
	},
	session: {
		strategy: "jwt",
	},
});
