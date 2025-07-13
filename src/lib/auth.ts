import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getUserLogin, getUserRole } from "@/src/query/user.query";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role } from "@prisma/client";
import NextAuth, { CredentialsSignin, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

class InvalidLoginError extends CredentialsSignin {
	override code = "Invalid identifier or password";
}

export type SessionUser = {
	id: string;
	name?: string | null;
	email: string;
	role: string;
	image?: string | null;
};

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
			authorize: async (credentials): Promise<User> => {
				if (!credentials?.email || !credentials?.password)
					throw new CredentialsSignin("Invalid credentials");

				// Add logic here to look up the user from the credentials supplied
				const user = await getUserLogin(
					credentials.email as string,
					credentials.password as string,
				);

				if (!user || !user.id || !user.email) throw new InvalidLoginError();

				return {
					id: user.id,
					name: user.fullName,
					email: user.email,
					role: user.role ?? Role.USER,
					image: user.image,
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
				session.user.role = (await getUserRole(session.user.id)) as Role;
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
	},
	session: {
		strategy: "jwt",
	},
});
