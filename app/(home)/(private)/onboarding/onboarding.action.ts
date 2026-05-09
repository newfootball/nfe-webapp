"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Foot, Position, UserType } from "@/src/generated/prisma/enums";
import { getUserSessionId } from "@/src/query/user.query";

const POSITION_MAP: Record<string, Position> = {
	GOALKEEPER: "GOALKEEPER",
	DEFENDER: "CENTRE_BACK",
	MIDFIELDER: "CENTRE_MIDFIELDER",
	FORWARD: "CENTRE_FORWARD",
	CENTRE_BACK: "CENTRE_BACK",
	RIGHT_BACK: "RIGHT_BACK",
	LEFT_BACK: "LEFT_BACK",
	DEFENSIVE_MIDFIELDER: "DEFENSIVE_MIDFIELDER",
	CENTRE_MIDFIELDER: "CENTRE_MIDFIELDER",
	ATTACKING_MIDFIELDER: "ATTACKING_MIDFIELDER",
	RIGHT_WINGER: "RIGHT_WINGER",
	LEFT_WINGER: "LEFT_WINGER",
	CENTRE_FORWARD: "CENTRE_FORWARD",
	STRIKER: "STRIKER",
};

type OnboardingData = {
	userType: UserType;
	birthDate?: Date;
	city?: string;
	position?: string;
	foot?: string;
	license?: string;
	clubName?: string;
	clubSize?: number;
	clubPosition?: string;
};

export async function saveOnboarding(data: OnboardingData) {
	const userId = await getUserSessionId();
	if (!userId) {
		return { success: false, error: "Unauthorized" };
	}

	try {
		const updateData: Parameters<typeof prisma.user.update>[0]["data"] = {
			userType: data.userType,
			isOnboarded: true,
		};

		if (data.birthDate) {
			updateData.birthday = data.birthDate;
		}

		if (data.city) {
			updateData.localisation = data.city;
		}

		if (data.license) {
			updateData.license = data.license;
		}

		if (data.clubName) {
			updateData.fullName = data.clubName;
		}

		if (data.position && POSITION_MAP[data.position]) {
			updateData.position = [POSITION_MAP[data.position] as Position];
		}

		if (data.foot) {
			if (data.foot === "BOTH") {
				updateData.foot = ["LEFT", "RIGHT"] as Foot[];
			} else if (data.foot === "LEFT" || data.foot === "RIGHT") {
				updateData.foot = [data.foot as Foot];
			}
		}

		await prisma.user.update({
			where: { id: userId },
			data: updateData,
		});

		revalidatePath("/");
		revalidatePath("/profile");

		return { success: true };
	} catch (error) {
		console.error("Error saving onboarding data:", error);
		return { success: false, error: "Failed to save onboarding data" };
	}
}
