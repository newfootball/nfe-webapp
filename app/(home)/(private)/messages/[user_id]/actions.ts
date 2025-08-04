"use server";

import { getSession } from "@/src/lib/auth-server";
import { prisma } from "@/src/lib/prisma";
import { revalidatePath } from "next/cache";

export async function sendMessage(formData: FormData) {
	try {
		const session = await getSession();

		if (!session) {
			throw new Error("Non autorisé");
		}

		const content = formData.get("content") as string;
		const toUserId = formData.get("toUserId") as string;

		if (!content || !toUserId) {
			throw new Error("Données manquantes");
		}

		await prisma.message.create({
			data: {
				content,
				fromUserId: session.user.id,
				toUserId,
			},
		});

		revalidatePath(`/messages/${toUserId}`);
		return { success: true };
	} catch (error) {
		console.error("[SEND_MESSAGE]", error);
		return { success: false, error: "Erreur lors de l'envoi du message" };
	}
}
