"use server";

import { cookies } from "next/headers";

export const getHasSeenSplash = async () => {
	const cookieStore = await cookies();
	return cookieStore.get("seen_splash")?.value === "true";
};
