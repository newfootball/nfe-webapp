import { Role } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
	/**
	 * Extend the built-in session types
	 */
	interface Session {
		user: {
			id: string;
			name?: string | null;
			email: string;
			role?: Role;
			image?: string | null;
		};
	}

	/**
	 * Extend the built-in user types
	 */
	interface User {
		role?: Role;
	}
}

declare module "next-auth/jwt" {
	/**
	 * Extend the built-in JWT types
	 */
	interface JWT {
		role?: Role;
	}
}
