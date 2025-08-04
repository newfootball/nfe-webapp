import { auth } from "@/src/lib/auth";
import { headers } from "next/headers";

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