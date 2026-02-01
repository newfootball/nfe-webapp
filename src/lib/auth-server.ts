import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";

export async function getSession() {
	try {
		const session = await auth.api.getSession({
			headers: await headers(),
		});
		return session;
	} catch {
		return null;
	}
}
