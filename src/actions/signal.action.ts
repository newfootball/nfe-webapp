"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserRole, getUserSessionId } from "../query/user.query";

async function requireAdmin() {
	const userId = await getUserSessionId();
	if (!userId) return null;
	const role = await getUserRole(userId);
	if (role !== "ADMIN") return null;
	return userId;
}

export async function reviewSignal(signalId: string) {
	const t = await getTranslations("admin.moderation");
	const userId = await requireAdmin();
	if (!userId) return { error: t("unauthorized") };

	try {
		await prisma.postSignal.update({
			where: { id: signalId },
			data: { status: "REVIEWED" },
		});
		revalidatePath("/admin/signals");
		return { success: true };
	} catch {
		return { error: t("review-failed") };
	}
}

export async function dismissSignal(signalId: string) {
	const t = await getTranslations("admin.moderation");
	const userId = await requireAdmin();
	if (!userId) return { error: t("unauthorized") };

	try {
		await prisma.postSignal.update({
			where: { id: signalId },
			data: { status: "DISMISSED" },
		});
		revalidatePath("/admin/signals");
		return { success: true };
	} catch {
		return { error: t("dismiss-failed") };
	}
}

export async function rejectSignaledPost(postId: string, signalId: string) {
	const t = await getTranslations("admin.moderation");
	const userId = await requireAdmin();
	if (!userId) return { error: t("unauthorized") };

	try {
		await prisma.$transaction([
			prisma.post.update({
				where: { id: postId },
				data: { status: "REJECTED" },
			}),
			prisma.postSignal.update({
				where: { id: signalId },
				data: { status: "REVIEWED" },
			}),
		]);
		revalidatePath("/admin/signals");
		revalidatePath(`/post/${postId}`);
		return { success: true };
	} catch {
		return { error: t("reject-failed") };
	}
}
