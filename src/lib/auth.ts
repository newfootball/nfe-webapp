import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { comparePassword, hashPassword } from "@/src/lib/password";
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
    password: {
      hash: hashPassword,
      verify: async ({ hash, password }) => {
        return comparePassword(password, hash);
      },
    },
  },
  plugins: [nextCookies()],
  secret: env.NEXTAUTH_SECRET || process.env.BETTER_AUTH_SECRET || "",
  baseURL: process.env.NEXT_PUBLIC_APP_URL || env.WEBSITE_URL,
});

export type Session = typeof auth.$Infer.Session;
