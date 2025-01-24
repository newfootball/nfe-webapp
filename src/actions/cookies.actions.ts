"use server";

import { cookies } from "next/headers";

export const setHasSeenSplash = async () => {
	const cookieStore = await cookies();
	cookieStore.set("seen_splash", "true");
};

export const getHasSeenSplash = async () => {
	const cookieStore = await cookies();
	return cookieStore.get("seen_splash")?.value === "true";
};
